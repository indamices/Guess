// 动态获取 WebSocket 地址，适配 Render 和本地开发环境
const socket = io(window.location.origin, {
    transports: ['websocket', 'polling'], // 添加polling作为后备
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
});

// Socket连接事件监听（用于调试）
socket.on('connect', () => {
    console.log('[DEBUG] Socket.IO 连接成功');
});

socket.on('connect_error', (error) => {
    console.error('[ERROR] Socket.IO 连接失败:', error);
    const currentError = loginErrorCreate || loginErrorJoin;
    if (currentError) {
        showError(currentError, '无法连接到服务器，请检查网络');
    }
});

socket.on('disconnect', (reason) => {
    console.log('[DEBUG] Socket.IO 断开连接:', reason);
});

// 移动端优化：防止双击缩放
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// 移动端优化：防止输入框缩放（iOS Safari）
const guessInput = document.getElementById('guess-input');
if (guessInput) {
    guessInput.addEventListener('focus', function() {
        // 延迟设置字体大小，防止iOS自动缩放
        setTimeout(() => {
            if (window.innerWidth < 768) {
                this.style.fontSize = '18px';
            }
        }, 100);
    });
}

// 游戏状态
let gameId = null;
let playerName = null;
let players = [];
let timerInterval = null;
let timeLeft = 60;

// DOM元素 - 延迟初始化
let loginScreen, waitingScreen, gameScreen, gameOverScreen;
let createRoomSection, joinRoomSection;
let playerNameInputCreate, playerNameInputJoin, gameIdInput, createRoomBtn, joinRoomBtn;
let switchToJoinBtn, switchToCreateBtn;
let loginErrorCreate, loginErrorJoin, roomStatusMessage, roomIdHint;
let currentPlayersDisplay, playersList, copyLinkBtn, gameLinkDisplay, qrcodeContainer;
let gamePlayersList, timerDisplay, statusMessage, guessBtn, errorMessage, guessesBody;
let gameResultTitle, correctNumber, finalGuessesBody, restartBtn, exitBtn, restartStatus;
let turnSound, victorySound, failSound;

// 初始化所有DOM元素
function initDOMElements() {
    loginScreen = document.getElementById('login-screen');
    waitingScreen = document.getElementById('waiting-screen');
    gameScreen = document.getElementById('game-screen');
    gameOverScreen = document.getElementById('game-over-screen');
    createRoomSection = document.getElementById('create-room-section');
    joinRoomSection = document.getElementById('join-room-section');
    playerNameInputCreate = document.getElementById('player-name-input-create');
    playerNameInputJoin = document.getElementById('player-name-input-join');
    gameIdInput = document.getElementById('game-id-input');
    createRoomBtn = document.getElementById('create-room-btn');
    joinRoomBtn = document.getElementById('join-room-btn');
    switchToJoinBtn = document.getElementById('switch-to-join-btn');
    switchToCreateBtn = document.getElementById('switch-to-create-btn');
    loginErrorCreate = document.getElementById('login-error-create');
    loginErrorJoin = document.getElementById('login-error-join');
    roomStatusMessage = document.getElementById('room-status-message');
    roomIdHint = document.getElementById('room-id-hint');
    currentPlayersDisplay = document.getElementById('current-players');
    playersList = document.getElementById('players-list');
    copyLinkBtn = document.getElementById('copy-link-btn');
    gameLinkDisplay = document.getElementById('game-link-display');
    qrcodeContainer = document.getElementById('qrcode');
    gamePlayersList = document.getElementById('game-players-list');
    timerDisplay = document.getElementById('timer-display');
    statusMessage = document.getElementById('status-message');
    guessBtn = document.getElementById('guess-btn');
    errorMessage = document.getElementById('error-message');
    guessesBody = document.getElementById('guesses-body');
    gameResultTitle = document.getElementById('game-result-title');
    correctNumber = document.getElementById('correct-number');
    finalGuessesBody = document.getElementById('final-guesses-body');
    restartBtn = document.getElementById('restart-btn');
    exitBtn = document.getElementById('exit-btn');
    restartStatus = document.getElementById('restart-status');
    turnSound = document.getElementById('turn-sound');
    victorySound = document.getElementById('victory-sound');
    failSound = document.getElementById('fail-sound');
    
    console.log('[DEBUG] DOM元素初始化完成');
}

// 初始化事件监听器
function initializeEventListeners() {
    console.log('[DEBUG] 开始初始化事件监听器');
    
    // 创建房间按钮
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', handleCreateRoom);
        createRoomBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCreateRoom();
        });
    }
    
    // 加入房间按钮
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', handleJoinRoom);
        joinRoomBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleJoinRoom();
        });
    }
    
    // 切换按钮
    if (switchToJoinBtn) {
        switchToJoinBtn.addEventListener('click', () => {
            showCreateRoomSection(false);
        });
    }
    
    if (switchToCreateBtn) {
        switchToCreateBtn.addEventListener('click', () => {
            showCreateRoomSection(true);
        });
    }
    
    // 输入框回车键
    if (playerNameInputCreate) {
        playerNameInputCreate.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleCreateRoom();
            }
        });
    }
    
    if (playerNameInputJoin) {
        playerNameInputJoin.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleJoinRoom();
            }
        });
    }
    
    if (gameIdInput) {
        gameIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleJoinRoom();
            }
        });
    }
    
    // 猜测输入框
    const guessInput = document.getElementById('guess-input');
    if (guessInput) {
        // 确保输入框只接受数字
        guessInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        
        // 移动端优化：自动聚焦时滚动到输入框
        const scrollToInput = () => {
            if (window.innerWidth < 768) {
                setTimeout(() => {
                    guessInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        };
        
        guessInput.addEventListener('focus', scrollToInput);
        
        guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitGuess();
            }
        });
    }
    
    // 提交猜测按钮
    if (guessBtn) {
        guessBtn.addEventListener('click', submitGuess);
    }
    
    // 复制链接按钮
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', handleCopyLink);
    }
    
    // 再来一局按钮
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            socket.emit('restartGame');
            if (restartStatus) {
                restartStatus.textContent = '已请求再来一局，等待对方确认...';
                restartStatus.style.display = 'block';
            }
        });
    }
    
    // 退出按钮
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            socket.emit('exitGame');
            showScreen('login');
            // 重置状态
            gameId = null;
            playerName = null;
            players = [];
            stopTimer();
            if (guessesBody) guessesBody.innerHTML = '';
            if (finalGuessesBody) finalGuessesBody.innerHTML = '';
            window.location.hash = '';
        });
    }
    
    console.log('[DEBUG] 事件监听器初始化完成');
}

// 处理创建房间
function handleCreateRoom() {
    console.log('[DEBUG] handleCreateRoom 被调用');
    
    if (!playerNameInputCreate) {
        console.error('[ERROR] playerNameInputCreate 不存在');
        return;
    }
    
    const name = playerNameInputCreate.value.trim();
    if (!name) {
        if (loginErrorCreate) {
            showError(loginErrorCreate, '请输入你的名字');
        }
        return;
    }
    
    playerName = name;
    gameId = generateGameId();
    
    // 更新URL但不刷新页面
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
    window.history.pushState({}, '', newUrl);
    
    console.log(`[CLIENT] 创建房间 - 玩家: ${playerName}, 房间ID: ${gameId}`);
    
    if (!socket.connected) {
        socket.connect();
        socket.once('connect', () => {
            socket.emit('joinGame', { gameId, playerName });
        });
    } else {
        socket.emit('joinGame', { gameId, playerName });
    }
}

// 处理加入房间
function handleJoinRoom() {
    console.log('[DEBUG] handleJoinRoom 被调用');
    
    if (!playerNameInputJoin) {
        console.error('[ERROR] playerNameInputJoin 不存在');
        return;
    }
    
    const name = playerNameInputJoin.value.trim();
    if (!name) {
        if (loginErrorJoin) {
            showError(loginErrorJoin, '请输入你的名字');
        }
        return;
    }
    
    const roomId = gameIdInput ? gameIdInput.value.trim() : '';
    if (!roomId) {
        if (loginErrorJoin) {
            showError(loginErrorJoin, '请输入房间ID');
        }
        return;
    }
    
    playerName = name;
    gameId = roomId;
    
    // 更新URL
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
    window.history.pushState({}, '', newUrl);
    
    console.log(`[CLIENT] 加入房间 - 玩家: ${playerName}, 房间ID: ${gameId}`);
    
    if (!socket.connected) {
        socket.connect();
        socket.once('connect', () => {
            socket.emit('joinGame', { gameId, playerName });
        });
    } else {
        socket.emit('joinGame', { gameId, playerName });
    }
}

// 处理加入游戏（向后兼容，保留旧逻辑）
function handleJoinGame() {
    // 这个函数保留用于向后兼容，但主要使用 handleCreateRoom 和 handleJoinRoom
    console.log('[DEBUG] handleJoinGame 被调用（向后兼容）');
    handleJoinRoom();
}

// 处理复制链接
function handleCopyLink() {
    // 使用query参数格式生成邀请链接
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        if (gameLinkDisplay) {
            gameLinkDisplay.textContent = '链接已复制到剪贴板！';
            gameLinkDisplay.style.display = 'block';
            setTimeout(() => {
                gameLinkDisplay.style.display = 'none';
            }, 3000);
        }
    }).catch(err => {
        console.error('复制失败：', err);
        if (gameLinkDisplay) {
            gameLinkDisplay.textContent = inviteLink;
            gameLinkDisplay.style.display = 'block';
        }
    });
}

// 生成游戏ID
function generateGameId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// 从URL获取房间ID（支持query参数和hash）
function getRoomIdFromURL() {
    // 优先从query参数获取
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        return roomParam;
    }
    
    // 其次从hash获取
    const hashId = window.location.hash.slice(1);
    if (hashId) {
        return hashId;
    }
    
    return null;
}

// 获取游戏ID（从URL hash或输入框）
function getGameId() {
    const urlRoomId = getRoomIdFromURL();
    const inputId = gameIdInput ? gameIdInput.value.trim() : '';
    return inputId || urlRoomId || generateGameId();
}

// 检查房间状态
function checkRoomStatus(roomId, callback) {
    if (!socket.connected) {
        socket.connect();
        socket.once('connect', () => {
            socket.emit('checkRoomStatus', { gameId: roomId });
        });
    } else {
        socket.emit('checkRoomStatus', { gameId: roomId });
    }
    
    socket.once('roomStatus', (data) => {
        if (callback) {
            callback(data);
        }
    });
}

// 显示/隐藏创建房间界面
function showCreateRoomSection(show) {
    if (show) {
        if (createRoomSection) createRoomSection.classList.remove('hidden');
        if (joinRoomSection) joinRoomSection.classList.add('hidden');
        // 清除错误消息
        if (loginErrorCreate) loginErrorCreate.style.display = 'none';
    } else {
        if (createRoomSection) createRoomSection.classList.add('hidden');
        if (joinRoomSection) joinRoomSection.classList.remove('hidden');
        // 清除错误消息
        if (loginErrorJoin) loginErrorJoin.style.display = 'none';
        // 如果房间ID输入框是只读的（从URL自动填充），保持只读；否则允许编辑
        if (gameIdInput && !gameIdInput.value) {
            gameIdInput.readOnly = false;
            if (roomIdHint) roomIdHint.style.display = 'none';
        }
    }
}

// 显示房间状态消息
function showRoomStatusMessage(message, type = 'info') {
    if (!roomStatusMessage) return;
    
    roomStatusMessage.textContent = message;
    roomStatusMessage.className = `room-status-message ${type}`;
    roomStatusMessage.style.display = 'block';
}

// 隐藏房间状态消息
function hideRoomStatusMessage() {
    if (roomStatusMessage) {
        roomStatusMessage.style.display = 'none';
        roomStatusMessage.className = 'room-status-message';
    }
}

// 显示屏幕
function showScreen(screenName) {
    console.log('[DEBUG] showScreen 被调用:', screenName);
    const screens = [loginScreen, waitingScreen, gameScreen, gameOverScreen];
    screens.forEach(screen => {
        if (screen) {
            screen.classList.add('hidden');
        }
    });
    
    let targetScreen = null;
    switch(screenName) {
        case 'login':
            targetScreen = loginScreen;
            break;
        case 'waiting':
            targetScreen = waitingScreen;
            break;
        case 'game':
            targetScreen = gameScreen;
            break;
        case 'gameOver':
            targetScreen = gameOverScreen;
            break;
    }
    
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        console.log('[DEBUG] 屏幕已切换到:', screenName);
    } else {
        console.error('[ERROR] 找不到目标屏幕:', screenName);
    }
}

// 显示错误
function showError(element, message) {
    if (!element) {
        console.error('[ERROR] showError: 元素不存在', message);
        // 如果元素不存在，使用alert作为后备
        alert(message);
        return;
    }
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        if (element) {
            element.style.display = 'none';
        }
    }, 5000);
}

// 更新玩家列表显示
function updatePlayersList(playersList) {
    if (!playersList || !Array.isArray(playersList)) {
        console.error('[ERROR] updatePlayersList: 无效的玩家列表');
        return;
    }
    
    const list = playersList.map(p => p.name).join(', ');
    if (gamePlayersList) {
        gamePlayersList.textContent = list;
    }
    
    if (waitingScreen && !waitingScreen.classList.contains('hidden')) {
        const playersListEl = document.getElementById('players-list');
        if (playersListEl) {
            const html = playersList.map(p => 
                `<div class="player-item">${p.name}</div>`
            ).join('');
            playersListEl.innerHTML = html || '<div>等待玩家加入...</div>';
        }
    }
}

// 计时器控制
function startTimer(seconds) {
    timeLeft = seconds;
    const timerDisplayEl = document.getElementById('timer-display');
    if (timerDisplayEl) {
        timerDisplayEl.textContent = timeLeft;
    }
    
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        timeLeft--;
        if (timerDisplayEl) {
            timerDisplayEl.textContent = timeLeft;
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (timerDisplayEl) {
                timerDisplayEl.textContent = '0';
            }
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    const timerDisplayEl = document.getElementById('timer-display');
    if (timerDisplayEl) {
        timerDisplayEl.textContent = '等待中...';
    }
}

// 播放音效
function playSound(audioElement) {
    if (audioElement) {
        audioElement.currentTime = 0;
        audioElement.play().catch(err => {
            console.error('提示音播放失败：', err);
        });
    }
}

// 生成二维码
function generateQRCode(url) {
    qrcodeContainer.innerHTML = '';
    QRCode.toCanvas(qrcodeContainer, url, { 
        width: 200,
        margin: 2
    }, (error) => {
        if (error) {
            console.error('二维码生成失败：', error);
            qrcodeContainer.innerHTML = '<p>二维码生成失败</p>';
        }
    });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initDOMElements();
        initializeEventListeners();
        // 延迟执行房间检测，确保Socket连接就绪
        setTimeout(() => {
            initRoomDetection();
        }, 200);
    });
} else {
    // DOM已经加载完成
    initDOMElements();
    initializeEventListeners();
    // 延迟执行房间检测，确保Socket连接就绪
    setTimeout(() => {
        initRoomDetection();
    }, 200);
}

// 提交猜测函数
function submitGuess() {
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    const errorMessage = document.getElementById('error-message');
    
    if (!guessInput) {
        console.error('[ERROR] 找不到猜测输入框');
        return;
    }
    
    const guess = guessInput.value.trim();
    
    if (!/^\d{4}$/.test(guess) || new Set(guess).size !== 4) {
        showError(errorMessage, '请输入4位不重复的数字！');
        return;
    }
    
    if (errorMessage) {
        errorMessage.textContent = '';
    }
    socket.emit('makeGuess', { guess });
    guessInput.disabled = true;
    if (guessBtn) {
        guessBtn.disabled = true;
    }
    guessInput.value = '';
}

// 这些事件监听器已经在 initializeEventListeners() 中绑定

// Socket事件监听

// 加入游戏成功
socket.on('gameJoined', (data) => {
    console.log('[CLIENT] 加入房间成功', data);
    
    if (!data) {
        console.error('[ERROR] gameJoined 数据为空');
        return;
    }
    
    gameId = data.gameId;
    players = data.players || [];
    
    // 隐藏房间状态消息
    hideRoomStatusMessage();
    
    // 更新URL
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
    window.history.pushState({}, '', newUrl);
    
    if (currentPlayersDisplay) {
        currentPlayersDisplay.textContent = `${players.length}/2`;
    }
    
    updatePlayersList(players);
    
    // 更新邀请链接和二维码
    if (gameId && qrcodeContainer) {
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
        generateQRCode(inviteLink);
    }
    
    if (data.isFull) {
        console.log('[DEBUG] 房间已满，切换到游戏界面');
        showScreen('game');
    } else {
        console.log('[DEBUG] 房间未满，切换到等待界面');
        showScreen('waiting');
    }
});

// 玩家加入
socket.on('playerJoined', (data) => {
    console.log('[CLIENT] 新玩家加入', data);
    if (data && data.players) {
        players = data.players;
        if (currentPlayersDisplay) {
            currentPlayersDisplay.textContent = `${players.length}/2`;
        }
        updatePlayersList(players);
    }
});

// 游戏准备就绪
socket.on('gameReady', () => {
    console.log('[CLIENT] 游戏开始 - gameReady 事件');
    showScreen('game');
    stopTimer();
    
    // 确保游戏界面元素已准备好
    if (statusMessage) {
        statusMessage.textContent = '等待游戏开始...';
    }
});

// 轮到你了
socket.on('yourTurn', (data) => {
    console.log('[CLIENT] 轮到你了', data);
    
    // 确保在游戏界面
    if (gameScreen && gameScreen.classList.contains('hidden')) {
        showScreen('game');
    }
    
    if (statusMessage) {
        statusMessage.textContent = '请开始猜测';
        statusMessage.className = 'status-message your-turn';
    }
    
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    
    if (guessInput) {
        guessInput.disabled = false;
        // 移动端优化：延迟聚焦，确保界面已更新
        setTimeout(() => {
            guessInput.focus();
            // 移动端滚动到输入框
            if (window.innerWidth < 768) {
                guessInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
    
    if (guessBtn) {
        guessBtn.disabled = false;
    }
    
    if (data && data.timeLeft) {
        startTimer(data.timeLeft);
    } else {
        startTimer(60);
    }
    
    playSound(turnSound);
    
    // 添加闪烁效果
    if (gameScreen) {
        gameScreen.classList.add('your-turn-highlight');
        setTimeout(() => {
            gameScreen.classList.remove('your-turn-highlight');
        }, 2000);
    }
});

// 等待对手
socket.on('waitForOpponent', () => {
    console.log('[CLIENT] 等待对手');
    if (statusMessage) {
        statusMessage.textContent = '请等待对方猜测';
        statusMessage.className = 'status-message';
    }
    
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    
    if (guessInput) {
        guessInput.disabled = true;
    }
    if (guessBtn) {
        guessBtn.disabled = true;
    }
    stopTimer();
});

// 猜测结果
socket.on('guessResult', (data) => {
    console.log('[CLIENT] 猜测结果', data);
    const isMyGuess = data.player === playerName;
    const row = document.createElement('tr');
    row.className = isMyGuess ? 'my-guess' : 'opponent-guess';
    row.innerHTML = `
        <td>${data.player}</td>
        <td>${data.guess}</td>
        <td>${data.result.a}A${data.result.b}B</td>
    `;
    guessesBody.appendChild(row);
    
    // 滚动到底部
    guessesBody.parentElement.scrollTop = guessesBody.parentElement.scrollHeight;
});

// 游戏结束
socket.on('gameOver', (data) => {
    console.log('[CLIENT] 游戏结束', data);
    stopTimer();
    showScreen('gameOver');
    
    const isWinner = data.winner === socket.id;
    gameResultTitle.textContent = isWinner ? '🎉 你赢了！' : '😔 你输了！';
    gameResultTitle.className = isWinner ? 'winner' : 'loser';
    correctNumber.textContent = data.targetNumber;
    
    // 播放音效
    if (isWinner) {
        playSound(victorySound);
    } else {
        playSound(failSound);
    }
    
    // 显示所有猜测记录
    finalGuessesBody.innerHTML = '';
    data.guesses.forEach(guess => {
        const isMyGuess = guess.player === playerName;
        const row = document.createElement('tr');
        row.className = isMyGuess ? 'my-guess' : 'opponent-guess';
        row.innerHTML = `
            <td>${guess.player}</td>
            <td>${guess.guess}</td>
            <td>${guess.result.a}A${guess.result.b}B</td>
        `;
        finalGuessesBody.appendChild(row);
    });
    
    restartStatus.style.display = 'none';
});

// 等待对手确认重启
socket.on('opponentWaitingForRestart', (data) => {
    console.log('[CLIENT] 对手等待重启', data);
    restartStatus.textContent = `${data.playerName} 已请求再来一局，点击按钮确认`;
    restartStatus.style.display = 'block';
});

// 等待对手确认
socket.on('waitingForOpponent', () => {
    restartStatus.textContent = '已请求再来一局，等待对方确认...';
    restartStatus.style.display = 'block';
});

// 游戏重启
socket.on('gameRestarted', () => {
    console.log('[CLIENT] 游戏重启');
    showScreen('game');
    guessesBody.innerHTML = '';
    restartStatus.style.display = 'none';
    stopTimer();
});

// 对手退出
socket.on('opponentExited', (data) => {
    console.log('[CLIENT] 对手退出', data);
    alert(`${data.playerName} 已退出游戏`);
    showScreen('waiting');
    stopTimer();
    guessesBody.innerHTML = '';
});

// 对手断开连接
socket.on('opponentDisconnected', (data) => {
    console.log('[CLIENT] 对手断开连接', data);
    alert(`${data.playerName} 已断开连接`);
    showScreen('waiting');
    stopTimer();
    guessesBody.innerHTML = '';
});

// 显示等待界面
socket.on('showWaiting', () => {
    showScreen('waiting');
    stopTimer();
});

// 错误处理
socket.on('error', (data) => {
    console.error('[CLIENT] 错误:', data.message);
    const currentError = loginErrorCreate || loginErrorJoin;
    if (currentError) {
        showError(currentError, data.message);
    }
    if (errorMessage) {
        showError(errorMessage, data.message);
    }
});

// 连接错误
socket.on('connect_error', (error) => {
    console.error('[CLIENT] 连接错误:', error);
    const currentError = loginErrorCreate || loginErrorJoin;
    if (currentError) {
        showError(currentError, '连接服务器失败，请检查网络');
    }
});

// 页面加载时自动检测房间
function initRoomDetection() {
    const roomId = getRoomIdFromURL();
    
    if (roomId) {
        console.log('[DEBUG] 检测到URL中的房间ID:', roomId);
        
        // 显示加入房间界面
        showCreateRoomSection(false);
        
        // 自动填充房间ID
        if (gameIdInput) {
            gameIdInput.value = roomId;
            gameIdInput.readOnly = true;
        }
        
        if (roomIdHint) {
            roomIdHint.style.display = 'block';
        }
        
        // 检查房间状态
        if (!socket.connected) {
            socket.connect();
            socket.once('connect', () => {
                checkRoomStatus(roomId, handleRoomStatusResponse);
            });
        } else {
            checkRoomStatus(roomId, handleRoomStatusResponse);
        }
    } else {
        // 没有房间ID，显示创建房间界面
        showCreateRoomSection(true);
    }
}

// 处理房间状态响应
function handleRoomStatusResponse(status) {
    console.log('[DEBUG] 房间状态:', status);
    
    if (!status.exists) {
        showRoomStatusMessage('房间不存在，请检查链接是否正确', 'error');
        if (gameIdInput) {
            gameIdInput.readOnly = false;
        }
        if (roomIdHint) {
            roomIdHint.style.display = 'none';
        }
        return;
    }
    
    if (status.isFull) {
        showRoomStatusMessage('房间已满（2/2），无法加入', 'warning');
        if (joinRoomBtn) {
            joinRoomBtn.disabled = true;
        }
    } else {
        showRoomStatusMessage(`房间可加入（${status.playerCount}/2）`, 'success');
        if (joinRoomBtn) {
            joinRoomBtn.disabled = false;
        }
        // 自动聚焦到名字输入框
        if (playerNameInputJoin) {
            setTimeout(() => {
                playerNameInputJoin.focus();
            }, 100);
        }
    }
}

// 这个初始化逻辑已经移到上面的页面加载完成处理中
