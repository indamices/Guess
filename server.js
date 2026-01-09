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
const players = new Map(); // socket.id -> { gameId, playerName, token }
const playerTimers = new Map(); // socket.id -> timer

// Token和重连管理
const playerTokens = new Map(); // token -> { socketId, playerId, gameId, playerName, disconnectedAt }
const waitingReconnect = new Map(); // gameId -> { waitingFor: playerId, playerName, timeout: timer, createdAt, token }
const gameStates = new Map(); // gameId -> 'normal' | 'waiting_reconnect' | 'practice_mode'

// 清理超时的计时器
function clearPlayerTimer(socketId) {
    if (playerTimers.has(socketId)) {
        clearTimeout(playerTimers.get(socketId));
        playerTimers.delete(socketId);
    }
}

// Token管理函数
function generateToken(playerId, gameId, playerName) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${gameId}_${timestamp}_${randomStr}`;
}

function saveToken(token, playerInfo) {
    playerTokens.set(token, {
        socketId: playerInfo.socketId,
        playerId: playerInfo.playerId,
        gameId: playerInfo.gameId,
        playerName: playerInfo.playerName,
        disconnectedAt: Date.now()
    });
}

function validateToken(token, gameId) {
    const tokenInfo = playerTokens.get(token);
    if (!tokenInfo) {
        return null;
    }
    // 验证token是否匹配gameId
    if (tokenInfo.gameId !== gameId) {
        return null;
    }
    return tokenInfo;
}

function getTokenByPlayerId(playerId, gameId) {
    for (const [token, info] of playerTokens.entries()) {
        if (info.playerId === playerId && info.gameId === gameId) {
            return token;
        }
    }
    return null;
}

// 清理等待重连状态
function clearWaitingReconnect(gameId) {
    const waiting = waitingReconnect.get(gameId);
    if (waiting && waiting.timeout) {
        clearTimeout(waiting.timeout);
    }
    waitingReconnect.delete(gameId);
    gameStates.set(gameId, 'normal');
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

    // 检查房间状态
    socket.on('checkRoomStatus', ({ gameId }) => {
        console.log(`[SERVER] 检查房间状态: ${gameId}`);
        
        if (!gameId || gameId.trim() === '') {
            socket.emit('roomStatus', {
                exists: false,
                isFull: false,
                playerCount: 0
            });
            return;
        }

        const game = games.get(gameId);
        if (!game) {
            socket.emit('roomStatus', {
                exists: false,
                isFull: false,
                playerCount: 0
            });
            return;
        }

        socket.emit('roomStatus', {
            exists: true,
            isFull: game.players.length >= 2,
            playerCount: game.players.length
        });
    });

    // 玩家加入游戏房间
    socket.on('joinGame', ({ gameId, playerName, token }) => {
        console.log(`[SERVER] 玩家尝试加入房间: ${gameId}, 名称: ${playerName}, token: ${token ? 'provided' : 'not provided'}`);

        if (!playerName || playerName.trim() === '') {
            socket.emit('error', { message: '请输入玩家名称' });
            return;
        }

        if (!gameId || gameId.trim() === '') {
            socket.emit('error', { message: '无效的房间ID' });
            return;
        }

        // 检查房间状态
        const gameState = gameStates.get(gameId) || 'normal';
        
        // 如果房间处于等待重连状态
        if (gameState === 'waiting_reconnect') {
            const waitingInfo = waitingReconnect.get(gameId);
            if (!token) {
                // 没有token，拒绝加入
                socket.emit('tokenRequired', { 
                    message: '房间正在等待玩家重连，无法加入',
                    waitingFor: waitingInfo?.playerName || '玩家'
                });
                return;
            }
            
            // 验证token
            const tokenInfo = validateToken(token, gameId);
            if (!tokenInfo || tokenInfo.playerId !== waitingInfo.waitingFor) {
                // token不匹配，拒绝加入
                socket.emit('tokenRequired', { 
                    message: '房间正在等待玩家重连，无法加入',
                    waitingFor: waitingInfo?.playerName || '玩家'
                });
                return;
            }
            
            // Token验证成功，恢复玩家状态
            console.log(`[SERVER] Token验证成功，恢复玩家状态: ${playerName}`);
            const game = games.get(gameId);
            if (!game) {
                socket.emit('error', { message: '房间不存在' });
                return;
            }
            
            // 更新socket.id映射
            const oldSocketId = tokenInfo.socketId;
            players.delete(oldSocketId);
            // 清理旧的计时器
            clearPlayerTimer(oldSocketId);
            players.set(socket.id, { gameId, playerName: playerName.trim(), token });
            
            // 更新游戏中的玩家ID
            const player = game.players.find(p => p.id === oldSocketId);
            if (player) {
                player.id = socket.id;
            }
            
            // 清理等待重连状态
            clearWaitingReconnect(gameId);
            
            socket.join(gameId);
            socket.emit('reconnectSuccess', {
                gameId,
                players: game.players.map(p => ({ id: p.id, name: p.name })),
                isFull: game.players.length === 2,
                gameState: game.isGameStarted ? 'playing' : 'waiting'
            });
            
            // 通知其他玩家重连成功
            socket.to(gameId).emit('opponentReconnected', {
                playerName: playerName.trim()
            });
            
            // 如果游戏进行中，恢复游戏状态
            if (game.isGameStarted && !game.isGameOver()) {
                const currentPlayer = game.getCurrentPlayer();
                if (currentPlayer && currentPlayer.id === socket.id) {
                    socket.emit('yourTurn', { timeLeft: 60 });
                    setPlayerTimer(socket.id, gameId, 60);
                } else {
                    socket.emit('waitForOpponent');
                }
            }
            
            return;
        }

        let game = games.get(gameId);
        if (!game) {
            game = new Game();
            games.set(gameId, game);
            gameStates.set(gameId, 'normal');
            console.log(`[SERVER] 创建新房间: ${gameId}`);
        }

        // 如果是首次加入，生成token
        let playerToken = token;
        if (!playerToken) {
            playerToken = generateToken(socket.id, gameId, playerName.trim());
            saveToken(playerToken, {
                socketId: socket.id,
                playerId: socket.id,
                gameId: gameId,
                playerName: playerName.trim()
            });
        }

        try {
            game.addPlayer({ id: socket.id, name: playerName.trim() });
            players.set(socket.id, { gameId, playerName: playerName.trim(), token: playerToken });
            console.log(`[SERVER] 玩家加入成功: ${playerName}, 当前人数: ${game.players.length}`);

            socket.join(gameId);
            socket.emit('gameJoined', {
                gameId,
                players: game.players.map(p => ({ id: p.id, name: p.name })),
                isFull: game.players.length === 2,
                token: playerToken // 返回token给客户端保存
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
                // 练习模式下不需要切换玩家和设置计时器
                if (!game.practiceMode) {
                    // 切换到下一个玩家
                    const nextPlayer = game.getCurrentPlayer();
                    if (nextPlayer) {
                        io.to(nextPlayer.id).emit('yourTurn', { timeLeft: 60 });
                        io.to(gameId).except(nextPlayer.id).emit('waitForOpponent');
                        setPlayerTimer(nextPlayer.id, gameId, 60);
                    }
                } else {
                    // 练习模式下，继续让当前玩家猜测
                    socket.emit('yourTurn', { timeLeft: 0 });
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

    // 玩家选择操作（当对手退出时）
    socket.on('playerChoice', ({ choice }) => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const gameId = playerInfo.gameId;
        const game = games.get(gameId);
        if (!game) return;

        if (choice === 'wait') {
            // 等待重连 - 已经在exitGame/disconnect中设置了等待状态
            // 这里只需要确认等待状态并通知客户端
            const waitingInfo = waitingReconnect.get(gameId);
            if (waitingInfo) {
                // 确保房间状态是等待重连
                gameStates.set(gameId, 'waiting_reconnect');
                socket.emit('waitingForReconnect', {
                    opponentName: waitingInfo.playerName,
                    timeout: 30
                });
            } else {
                // 如果没有等待信息，说明对手已经重新连接或者状态异常
                socket.emit('error', { message: '等待状态已失效' });
            }
        } else if (choice === 'practice') {
            // 切换到练习模式
            // 先获取等待信息，再清理
            const waitingInfo = waitingReconnect.get(gameId);
            if (waitingInfo) {
                game.removePlayer(waitingInfo.waitingFor);
            }
            clearWaitingReconnect(gameId);
            
            game.practiceMode = true;
            game.isGameStarted = true;
            game.currentPlayerIndex = 0; // 设置为剩余玩家
            
            gameStates.set(gameId, 'practice_mode');
            
            // 通知玩家进入练习模式（不发送targetNumber，避免暴露答案）
            socket.emit('practiceModeStarted', {
                gameId,
                players: game.players.map(p => ({ id: p.id, name: p.name }))
            });
            
            // 如果是游戏进行中，恢复游戏状态
            if (game.isGameStarted && !game.isGameOver()) {
                socket.emit('yourTurn', { timeLeft: 0 }); // 练习模式下不限时
            }
        } else if (choice === 'quit') {
            // 退出游戏
            // 先获取等待信息，清理等待状态，并移除等待的玩家
            const waitingInfo = waitingReconnect.get(gameId);
            if (waitingInfo) {
                game.removePlayer(waitingInfo.waitingFor);
            }
            clearWaitingReconnect(gameId);
            
            // 移除当前玩家
            game.removePlayer(socket.id);
            if (game.players.length === 0) {
                games.delete(gameId);
                gameStates.delete(gameId);
            }
            socket.leave(gameId);
            players.delete(socket.id);
            socket.emit('gameExited');
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
            const playerName = player?.name || '玩家';
            
            // 如果游戏进行中且有其他玩家，进入等待重连状态
            if (game.isGameStarted && !game.isGameOver() && game.players.length === 2) {
                // 获取或生成token
                let playerToken = playerInfo.token || getTokenByPlayerId(socket.id, gameId);
                if (!playerToken) {
                    playerToken = generateToken(socket.id, gameId, playerName);
                    saveToken(playerToken, {
                        socketId: socket.id,
                        playerId: socket.id,
                        gameId: gameId,
                        playerName: playerName
                    });
                }
                
                // 设置等待重连状态（30秒超时）
                const timeout = setTimeout(() => {
                    const currentWaiting = waitingReconnect.get(gameId);
                    if (currentWaiting && currentWaiting.waitingFor === socket.id) {
                        // 清理等待状态
                        clearWaitingReconnect(gameId);
                        // 移除等待的玩家（如果仍在游戏中）
                        const remainingGame = games.get(gameId);
                        if (remainingGame) {
                            remainingGame.removePlayer(socket.id);
                            // 通知剩余玩家重连超时
                            if (remainingGame.players.length > 0) {
                                const remainingPlayer = remainingGame.players[0];
                                io.to(remainingPlayer.id).emit('reconnectTimeout');
                            } else {
                                // 如果没有剩余玩家，清理房间
                                games.delete(gameId);
                                gameStates.delete(gameId);
                            }
                        }
                    }
                }, 30000);
                
                waitingReconnect.set(gameId, {
                    waitingFor: socket.id,
                    playerName: playerName,
                    timeout: timeout,
                    createdAt: Date.now(),
                    token: playerToken
                });
                gameStates.set(gameId, 'waiting_reconnect');
                
                // 通知剩余玩家对手已退出，让他们选择操作
                socket.to(gameId).emit('opponentLeft', {
                    playerName: playerName,
                    canWait: true
                });
            } else {
                // 游戏未开始或只有一人，直接退出
                socket.to(gameId).emit('opponentExited', {
                    playerName: playerName
                });
                game.removePlayer(socket.id);
                
                if (game.players.length === 0) {
                    games.delete(gameId);
                    gameStates.delete(gameId);
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
                const playerName = player?.name || '玩家';
                
                // 如果游戏进行中且有其他玩家，进入等待重连状态
                if (game.isGameStarted && !game.isGameOver() && game.players.length === 2) {
                    // 获取或生成token
                    let playerToken = playerInfo.token || getTokenByPlayerId(socket.id, gameId);
                    if (!playerToken) {
                        playerToken = generateToken(socket.id, gameId, playerName);
                        saveToken(playerToken, {
                            socketId: socket.id,
                            playerId: socket.id,
                            gameId: gameId,
                            playerName: playerName
                        });
                    }
                    
                    // 设置等待重连状态（30秒超时）
                    const timeout = setTimeout(() => {
                        const currentWaiting = waitingReconnect.get(gameId);
                        if (currentWaiting && currentWaiting.waitingFor === socket.id) {
                            // 清理等待状态
                            clearWaitingReconnect(gameId);
                            // 移除等待的玩家（如果仍在游戏中）
                            const remainingGame = games.get(gameId);
                            if (remainingGame) {
                                remainingGame.removePlayer(socket.id);
                                // 通知剩余玩家重连超时
                                if (remainingGame.players.length > 0) {
                                    const remainingPlayer = remainingGame.players[0];
                                    io.to(remainingPlayer.id).emit('reconnectTimeout');
                                } else {
                                    // 如果没有剩余玩家，清理房间
                                    games.delete(gameId);
                                    gameStates.delete(gameId);
                                }
                            }
                        }
                    }, 30000);
                    
                    waitingReconnect.set(gameId, {
                        waitingFor: socket.id,
                        playerName: playerName,
                        timeout: timeout,
                        createdAt: Date.now(),
                        token: playerToken
                    });
                    gameStates.set(gameId, 'waiting_reconnect');
                    
                    // 通知剩余玩家对手已退出，让他们选择操作
                    socket.to(gameId).emit('opponentLeft', {
                        playerName: playerName,
                        canWait: true
                    });
                } else {
                    // 游戏未开始或只有一人，直接移除玩家
                    game.removePlayer(socket.id);
                    
                    // 通知其他玩家
                    socket.to(gameId).emit('opponentDisconnected', {
                        playerName: playerName
                    });
                    
                    if (game.players.length === 0) {
                        games.delete(gameId);
                        gameStates.delete(gameId);
                        clearWaitingReconnect(gameId);
                        console.log(`[SERVER] 清理空房间: ${gameId}`);
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
