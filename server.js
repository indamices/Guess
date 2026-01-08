const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Game = require('./src/game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // 允许跨域访问
        methods: ['GET', 'POST'],
    },
});

// 使用 Render 的动态端口
const port = process.env.PORT || 3000;

// 配置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 游戏状态存储
const games = new Map(); // gameId -> Game实例
const players = new Map(); // socket.id -> { gameId, playerName }
const playerTimers = new Map(); // socket.id -> timer

// 清理超时的计时器
function clearPlayerTimer(socketId) {
    if (playerTimers.has(socketId)) {
        clearTimeout(playerTimers.get(socketId));
        playerTimers.delete(socketId);
    }
}

// 设置玩家计时器
function setPlayerTimer(socketId, gameId, timeoutSeconds = 60) {
    clearPlayerTimer(socketId);
    
    const timer = setTimeout(() => {
        const game = games.get(gameId);
        if (game && game.getCurrentPlayer()?.id === socketId) {
            console.log(`[SERVER] 玩家 ${socketId} 超时`);
            try {
                const result = game.makeGuess(socketId, 'timeout');
                const currentPlayer = game.getCurrentPlayer();
                
                io.to(gameId).emit('guessResult', {
                    player: players.get(socketId)?.playerName || '玩家',
                    guess: '超时',
                    result
                });

                if (game.isGameOver()) {
                    handleGameOver(gameId, game);
                } else if (currentPlayer) {
                    io.to(currentPlayer.id).emit('yourTurn', { timeLeft: timeoutSeconds });
                    io.to(gameId).except(currentPlayer.id).emit('waitForOpponent');
                    setPlayerTimer(currentPlayer.id, gameId, timeoutSeconds);
                }
            } catch (err) {
                console.error(`[SERVER] 超时处理错误: ${err.message}`);
            }
        }
    }, timeoutSeconds * 1000);
    
    playerTimers.set(socketId, timer);
}

// 处理游戏结束
function handleGameOver(gameId, game) {
    const lastGuess = game.guesses[game.guesses.length - 1];
    const winner = game.players.find(p => p.id === lastGuess.player);
    
    // 清理所有计时器
    game.players.forEach(player => {
        clearPlayerTimer(player.id);
    });

    io.to(gameId).emit('gameOver', {
        winner: winner.id,
        winnerName: winner.name,
        targetNumber: game.targetNumber,
        guesses: game.guesses.map(g => ({
            player: game.players.find(p => p.id === g.player)?.name || '未知',
            guess: g.guess,
            result: g.result
        }))
    });

    // 5秒后清理房间（如果玩家没有请求重启）
    setTimeout(() => {
        const currentGame = games.get(gameId);
        if (currentGame && currentGame.restartRequests.size === 0) {
            games.delete(gameId);
            console.log(`[SERVER] 清理房间: ${gameId}`);
        }
    }, 5000);
}

io.on('connection', (socket) => {
    console.log(`[SERVER] 新客户端连接: ${socket.id}`);

    // 玩家加入游戏房间
    socket.on('joinGame', ({ gameId, playerName }) => {
        console.log(`[SERVER] 玩家尝试加入房间: ${gameId}, 名称: ${playerName}`);

        if (!playerName || playerName.trim() === '') {
            socket.emit('error', { message: '请输入玩家名称' });
            return;
        }

        if (!gameId || gameId.trim() === '') {
            socket.emit('error', { message: '无效的房间ID' });
            return;
        }

        let game = games.get(gameId);
        if (!game) {
            game = new Game();
            games.set(gameId, game);
            console.log(`[SERVER] 创建新房间: ${gameId}`);
        }

        try {
            game.addPlayer({ id: socket.id, name: playerName.trim() });
            players.set(socket.id, { gameId, playerName: playerName.trim() });
            console.log(`[SERVER] 玩家加入成功: ${playerName}, 当前人数: ${game.players.length}`);

            socket.join(gameId);
            socket.emit('gameJoined', {
                gameId,
                players: game.players.map(p => ({ id: p.id, name: p.name })),
                isFull: game.players.length === 2
            });

            // 向房间内其他玩家广播新玩家加入
            socket.to(gameId).emit('playerJoined', {
                player: { id: socket.id, name: playerName.trim() },
                players: game.players.map(p => ({ id: p.id, name: p.name }))
            });

            // 如果房间满员，开始游戏
            if (game.players.length === 2 && !game.isGameStarted) {
                console.log(`[SERVER] 房间 ${gameId} 已满，开始游戏`);
                const firstPlayer = game.start();
                io.to(gameId).emit('gameReady');
                io.to(firstPlayer.id).emit('yourTurn', { timeLeft: 60 });
                io.to(gameId).except(firstPlayer.id).emit('waitForOpponent');
                setPlayerTimer(firstPlayer.id, gameId, 60);
            }
        } catch (err) {
            console.error(`[SERVER] 错误: ${err.message}`);
            socket.emit('error', { message: err.message });
        }
    });

    // 处理玩家猜测
    socket.on('makeGuess', ({ guess }) => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) {
            socket.emit('error', { message: '你还没有加入游戏' });
            return;
        }

        const gameId = playerInfo.gameId;
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', { message: '游戏不存在' });
            return;
        }

        try {
            clearPlayerTimer(socket.id);
            const result = game.makeGuess(socket.id, guess);
            const player = game.players.find(p => p.id === socket.id);
            console.log(`[SERVER] 玩家 ${player.name} 猜测: ${guess}, 结果: ${result.a}A${result.b}B`);

            // 广播猜测结果
            io.to(gameId).emit('guessResult', {
                player: player.name,
                guess,
                result
            });

            // 检查游戏是否结束
            if (game.isGameOver()) {
                handleGameOver(gameId, game);
            } else {
                // 切换到下一个玩家
                const nextPlayer = game.getCurrentPlayer();
                if (nextPlayer) {
                    io.to(nextPlayer.id).emit('yourTurn', { timeLeft: 60 });
                    io.to(gameId).except(nextPlayer.id).emit('waitForOpponent');
                    setPlayerTimer(nextPlayer.id, gameId, 60);
                }
            }
        } catch (err) {
            console.error(`[SERVER] 猜测错误: ${err.message}`);
            socket.emit('error', { message: err.message });
        }
    });

    // 玩家请求再来一局
    socket.on('restartGame', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) {
            socket.emit('error', { message: '你还没有加入游戏' });
            return;
        }

        const gameId = playerInfo.gameId;
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', { message: '游戏不存在' });
            return;
        }

        clearPlayerTimer(socket.id);
        const shouldRestart = game.requestRestart(socket.id);
        const player = game.players.find(p => p.id === socket.id);

        socket.emit('waitingForOpponent');

        // 通知其他玩家
        socket.to(gameId).emit('opponentWaitingForRestart', {
            playerName: player.name
        });

        // 如果两位玩家都请求再来一局，重新开始游戏
        if (shouldRestart) {
            game.reset();
            const firstPlayer = game.start();
            io.to(gameId).emit('gameRestarted');
            io.to(firstPlayer.id).emit('yourTurn', { timeLeft: 60 });
            io.to(gameId).except(firstPlayer.id).emit('waitForOpponent');
            setPlayerTimer(firstPlayer.id, gameId, 60);
        }
    });

    // 玩家退出游戏
    socket.on('exitGame', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const gameId = playerInfo.gameId;
        const game = games.get(gameId);
        
        clearPlayerTimer(socket.id);
        
        if (game) {
            const player = game.players.find(p => p.id === socket.id);
            socket.to(gameId).emit('opponentExited', {
                playerName: player?.name || '玩家'
            });
            game.removePlayer(socket.id);
            
            if (game.players.length === 0) {
                games.delete(gameId);
            } else {
                // 如果游戏正在进行，切换到下一个玩家
                if (game.isGameStarted && !game.isGameOver()) {
                    const currentPlayer = game.getCurrentPlayer();
                    if (currentPlayer) {
                        io.to(currentPlayer.id).emit('yourTurn', { timeLeft: 60 });
                        setPlayerTimer(currentPlayer.id, gameId, 60);
                    }
                }
            }
        }
        
        socket.leave(gameId);
        players.delete(socket.id);
        socket.emit('showWaiting');
    });

    // 玩家断开连接
    socket.on('disconnect', () => {
        console.log(`[SERVER] 客户端断开: ${socket.id}`);
        const playerInfo = players.get(socket.id);
        
        clearPlayerTimer(socket.id);
        
        if (playerInfo) {
            const gameId = playerInfo.gameId;
            const game = games.get(gameId);
            
            if (game) {
                const player = game.players.find(p => p.id === socket.id);
                game.removePlayer(socket.id);
                
                // 通知其他玩家
                socket.to(gameId).emit('opponentDisconnected', {
                    playerName: player?.name || '玩家'
                });
                
                if (game.players.length === 0) {
                    games.delete(gameId);
                    console.log(`[SERVER] 清理空房间: ${gameId}`);
                } else {
                    // 如果游戏正在进行，切换到下一个玩家
                    if (game.isGameStarted && !game.isGameOver()) {
                        const currentPlayer = game.getCurrentPlayer();
                        if (currentPlayer) {
                            io.to(currentPlayer.id).emit('yourTurn', { timeLeft: 60 });
                            setPlayerTimer(currentPlayer.id, gameId, 60);
                        }
                    }
                }
            }
            
            players.delete(socket.id);
        }
    });
});

// 启动服务器
server.listen(port, () => {
    console.log(`[SERVER] 服务器运行在端口 ${port}`);
});
