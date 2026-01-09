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
let isJoiningRoom = false; // 标志：是否正在加入房间（防止自动检测干扰）

// Token管理函数
function savePlayerToken(gameId, token) {
    try {
        localStorage.setItem(`player_token_${gameId}`, token);
        console.log(`[CLIENT] Token已保存: ${gameId}`);
    } catch (e) {
        console.error('[ERROR] 保存Token失败:', e);
    }
}

function getPlayerToken(gameId) {
    try {
        return localStorage.getItem(`player_token_${gameId}`);
    } catch (e) {
        console.error('[ERROR] 获取Token失败:', e);
        return null;
    }
}

function removePlayerToken(gameId) {
    try {
        localStorage.removeItem(`player_token_${gameId}`);
        console.log(`[CLIENT] Token已删除: ${gameId}`);
    } catch (e) {
        console.error('[ERROR] 删除Token失败:', e);
    }
}

// 单人游戏状态
let isSinglePlayerMode = false;
let singlePlayerGame = null; // 单人游戏实例
let singlePlayerStartTime = null;
let singlePlayerGuessCount = 0;

// DOM元素 - 延迟初始化
let loginScreen, waitingScreen, gameScreen, gameOverScreen, opponentLeftScreen, waitingReconnectScreen;
let createRoomSection, joinRoomSection;
let playerNameInputCreate, playerNameInputJoin, gameIdInput, createRoomBtn, joinRoomBtn;
let switchToJoinBtn, switchToCreateBtn, singlePlayerBtn;
let loginErrorCreate, loginErrorJoin, roomStatusMessage, roomIdHint;
let currentPlayersDisplay, playersList, copyLinkBtn, gameLinkDisplay, qrcodeContainer;
let gamePlayersList, timerDisplay, statusMessage, guessBtn, errorMessage, guessesBody;
let gameResultTitle, correctNumber, finalGuessesBody, restartBtn, exitBtn, restartStatus;
let opponentNameDisplay, waitOpponentBtn, practiceModeBtn, quitGameBtn;
let reconnectOpponentName, reconnectTimer;
let turnSound, victorySound, failSound;

// Token和重连状态
let playerToken = null; // 当前玩家的token
let reconnectTimeoutTimer = null; // 等待重连倒计时
let isPracticeMode = false; // 是否处于练习模式

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
    singlePlayerBtn = document.getElementById('single-player-btn');
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
    
    // 对手退出和等待重连界面元素
    opponentLeftScreen = document.getElementById('opponent-left-screen');
    waitingReconnectScreen = document.getElementById('waiting-reconnect-screen');
    opponentNameDisplay = document.getElementById('opponent-name-display');
    waitOpponentBtn = document.getElementById('wait-opponent-btn');
    practiceModeBtn = document.getElementById('practice-mode-btn');
    quitGameBtn = document.getElementById('quit-game-btn');
    reconnectOpponentName = document.getElementById('reconnect-opponent-name');
    reconnectTimer = document.getElementById('reconnect-timer');
    
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
    
    // 单人游戏按钮
    if (singlePlayerBtn) {
        singlePlayerBtn.addEventListener('click', handleSinglePlayer);
        singlePlayerBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSinglePlayer();
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
    
    // 再来一局按钮（多人模式）
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            // 如果是单人模式，已经在handleSinglePlayerGameOver中设置了onclick
            if (!isSinglePlayerMode) {
                socket.emit('restartGame');
                if (restartStatus) {
                    restartStatus.textContent = '已请求再来一局，等待对方确认...';
                    restartStatus.style.display = 'block';
                }
            }
        });
    }
    
    // 退出按钮（多人模式）
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            // 如果是单人模式，已经在handleSinglePlayerGameOver中设置了onclick
            if (!isSinglePlayerMode) {
                socket.emit('exitGame');
                showScreen('login');
                // 重置状态
                gameId = null;
                playerName = null;
                players = [];
                playerToken = null;
                isPracticeMode = false;
                stopTimer();
                if (guessesBody) guessesBody.innerHTML = '';
                if (finalGuessesBody) finalGuessesBody.innerHTML = '';
                window.location.hash = '';
            }
        });
    }
    
    // 对手退出选择按钮
    if (waitOpponentBtn) {
        waitOpponentBtn.addEventListener('click', () => {
            socket.emit('playerChoice', { choice: 'wait' });
        });
    }
    
    if (practiceModeBtn) {
        practiceModeBtn.addEventListener('click', () => {
            socket.emit('playerChoice', { choice: 'practice' });
        });
    }
    
    if (quitGameBtn) {
        quitGameBtn.addEventListener('click', () => {
            socket.emit('playerChoice', { choice: 'quit' });
            // 先清理token，再重置gameId
            if (gameId) {
                removePlayerToken(gameId);
            }
            showScreen('login');
            // 重置状态
            gameId = null;
            playerName = null;
            players = [];
            playerToken = null;
            isPracticeMode = false;
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
    isJoiningRoom = true; // 设置标志，防止自动检测干扰
    
    console.log(`[CLIENT] 创建房间 - 玩家: ${playerName}, 房间ID: ${gameId}`);
    
    // 清除错误消息
    if (loginErrorCreate) {
        loginErrorCreate.style.display = 'none';
    }
    
    // 确保Socket连接
    const joinRoom = () => {
        console.log('[DEBUG] ========== 发送加入房间请求 ==========');
        console.log('[DEBUG] gameId:', gameId);
        console.log('[DEBUG] playerName:', playerName);
        console.log('[DEBUG] Socket连接状态:', socket.connected);
        
        // 设置一个超时，如果3秒内没有收到gameJoined事件，强制显示等待界面
        const timeoutId = setTimeout(() => {
            console.warn('[WARN] 3秒内未收到gameJoined事件，强制显示等待界面');
            if (waitingScreen) {
                showScreen('waiting');
                if (currentPlayersDisplay) {
                    currentPlayersDisplay.textContent = '1/2';
                }
                if (gameId && qrcodeContainer) {
                    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
                    generateQRCode(inviteLink);
                }
            }
        }, 3000);
        
        // 当收到gameJoined事件时，清除超时
        socket.once('gameJoined', () => {
            clearTimeout(timeoutId);
        });
        
        // 尝试从localStorage获取token（重连时）
        const token = getPlayerToken(gameId);
        socket.emit('joinGame', { gameId, playerName, token });
        console.log('[DEBUG] joinGame 事件已发送', { gameId, playerName, token: token ? 'provided' : 'not provided' });
    };
    
    if (!socket.connected) {
        console.log('[DEBUG] Socket未连接，等待连接...');
        if (loginErrorCreate) {
            showError(loginErrorCreate, '正在连接服务器，请稍候...');
        }
        socket.connect();
        socket.once('connect', () => {
            console.log('[DEBUG] Socket连接成功，准备加入房间');
            if (loginErrorCreate) {
                loginErrorCreate.style.display = 'none';
            }
            joinRoom();
        });
    } else {
        console.log('[DEBUG] Socket已连接，直接加入房间');
        joinRoom();
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
    isJoiningRoom = true; // 设置标志，防止自动检测干扰
    
    // 更新URL
    const newUrl = `${window.location.origin}${window.location.pathname}?room=${gameId}`;
    window.history.pushState({}, '', newUrl);
    
    console.log(`[CLIENT] 加入房间 - 玩家: ${playerName}, 房间ID: ${gameId}`);
    
    // 清除错误消息
    if (loginErrorJoin) {
        loginErrorJoin.style.display = 'none';
    }
    
    if (!socket.connected) {
        socket.connect();
        socket.once('connect', () => {
            // 尝试从localStorage获取token（重连时）
            const token = getPlayerToken(gameId);
            socket.emit('joinGame', { gameId, playerName, token });
        });
    } else {
        // 尝试从localStorage获取token（重连时）
        const token = getPlayerToken(gameId);
        socket.emit('joinGame', { gameId, playerName, token });
    }
}

// 处理加入游戏（向后兼容，保留旧逻辑）
function handleJoinGame() {
    // 这个函数保留用于向后兼容，但主要使用 handleCreateRoom 和 handleJoinRoom
    console.log('[DEBUG] handleJoinGame 被调用（向后兼容）');
    handleJoinRoom();
}

// 处理单人游戏
function handleSinglePlayer() {
    console.log('[DEBUG] handleSinglePlayer 被调用');
    
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
    
    playerName = name || '玩家';
    isSinglePlayerMode = true;
    singlePlayerGuessCount = 0;
    singlePlayerStartTime = Date.now();
    
    // 创建单人游戏实例（使用Game类，但只添加一个玩家）
    // 由于Game类需要服务器端，我们创建一个简化的单人游戏逻辑
    singlePlayerGame = {
        targetNumber: generateSinglePlayerTarget(),
        guesses: [],
        isGameOver: false
    };
    
    console.log('[DEBUG] 单人游戏开始，目标数字:', singlePlayerGame.targetNumber);
    
    // 清除错误消息
    if (loginErrorCreate) {
        loginErrorCreate.style.display = 'none';
    }
    
    // 直接进入游戏界面
    showScreen('game');
    
    // 更新界面以适配单人模式
    updateUIForSinglePlayer();
    
    // 启用输入框
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    if (guessInput) {
        guessInput.disabled = false;
        guessInput.focus();
    }
    if (guessBtn) {
        guessBtn.disabled = false;
    }
    
    // 更新状态消息
    if (statusMessage) {
        statusMessage.textContent = '开始猜测吧！';
    }
}

// 生成单人游戏目标数字
function generateSinglePlayerTarget() {
    const digits = new Set();
    while (digits.size < 4) {
        digits.add(Math.floor(Math.random() * 10));
    }
    return Array.from(digits).join('');
}

// 计算A和B结果
function calculateSinglePlayerResult(guess, target) {
    let a = 0, b = 0;
    for (let i = 0; i < 4; i++) {
        if (guess[i] === target[i]) {
            a++;
        } else if (target.includes(guess[i])) {
            b++;
        }
    }
    return { a, b };
}

// 更新界面以适配单人模式
function updateUIForSinglePlayer() {
    // 更新玩家列表显示
    if (gamePlayersList) {
        gamePlayersList.textContent = playerName;
    }
    
    // 更新计时器显示为猜测次数
    const gameInfo = document.querySelector('.game-info');
    if (gameInfo) {
        const infoItems = gameInfo.querySelectorAll('.info-item');
        if (infoItems.length > 0) {
            // 更新第一个信息项（玩家信息）
            if (infoItems[0]) {
                const span = infoItems[0].querySelector('span:last-child');
                if (span) {
                    span.textContent = playerName;
                }
            }
            // 更新第二个信息项（计时器改为猜测次数）
            if (infoItems.length > 1 && infoItems[1]) {
                const label = infoItems[1].querySelector('span:first-child');
                const value = infoItems[1].querySelector('span:last-child');
                if (label) {
                    label.textContent = '猜测次数：';
                }
                if (value) {
                    value.textContent = singlePlayerGuessCount || '0';
                    // 移除timer class，因为现在是猜测次数
                    value.classList.remove('timer');
                    value.id = 'timer-display'; // 确保ID正确
                }
                // 隐藏或移除"秒"文本（如果存在）
                const infoItem = infoItems[1];
                if (infoItem) {
                    // 查找所有文本节点，移除包含"秒"的文本
                    const walker = document.createTreeWalker(
                        infoItem,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.trim() === '秒') {
                            node.textContent = '';
                        }
                    }
                }
            }
        }
    }
    
    // 直接更新timerDisplay（如果存在）
    if (timerDisplay) {
        timerDisplay.textContent = singlePlayerGuessCount || '0';
        timerDisplay.classList.remove('timer');
    }
    
    // 更新状态消息
    if (statusMessage) {
        statusMessage.textContent = '开始猜测吧！';
    }
    
    // 清空猜测记录
    if (guessesBody) {
        guessesBody.innerHTML = '';
    }
    
    // 确保输入框和按钮可用
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    if (guessInput) {
        guessInput.disabled = false;
        guessInput.placeholder = '输入4位不重复数字';
    }
    if (guessBtn) {
        guessBtn.disabled = false;
    }
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
    console.log('[DEBUG] ========== showScreen 被调用 ==========');
    console.log('[DEBUG] 目标屏幕:', screenName);
    
    // 重新获取DOM元素，确保它们是最新的
    if (!loginScreen) loginScreen = document.getElementById('login-screen');
    if (!waitingScreen) waitingScreen = document.getElementById('waiting-screen');
    if (!gameScreen) gameScreen = document.getElementById('game-screen');
    if (!gameOverScreen) gameOverScreen = document.getElementById('game-over-screen');
    if (!opponentLeftScreen) opponentLeftScreen = document.getElementById('opponent-left-screen');
    if (!waitingReconnectScreen) waitingReconnectScreen = document.getElementById('waiting-reconnect-screen');
    
    console.log('[DEBUG] loginScreen:', loginScreen);
    console.log('[DEBUG] waitingScreen:', waitingScreen);
    console.log('[DEBUG] gameScreen:', gameScreen);
    console.log('[DEBUG] gameOverScreen:', gameOverScreen);
    
    const screens = [loginScreen, waitingScreen, gameScreen, gameOverScreen, opponentLeftScreen, waitingReconnectScreen];
    screens.forEach((screen, index) => {
        if (screen) {
            console.log(`[DEBUG] 隐藏屏幕 ${index}:`, screen.id || 'unknown');
            screen.classList.add('hidden');
            // 强制设置display为none，确保隐藏
            screen.style.display = 'none';
        } else {
            console.warn(`[WARN] 屏幕 ${index} 元素不存在`);
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
        case 'opponent-left':
            targetScreen = opponentLeftScreen;
            break;
        case 'waiting-reconnect':
            targetScreen = waitingReconnectScreen;
            break;
    }
    
    if (targetScreen) {
        console.log('[DEBUG] 显示目标屏幕:', targetScreen.id || 'unknown');
        targetScreen.classList.remove('hidden');
        // 强制设置display，确保显示
        targetScreen.style.display = 'block';
        console.log('[DEBUG] 屏幕切换完成，当前classList:', targetScreen.classList.toString());
        console.log('[DEBUG] 屏幕display样式:', targetScreen.style.display);
        console.log('[DEBUG] ========== showScreen 完成 ==========');
    } else {
        console.error('[ERROR] 找不到目标屏幕:', screenName);
        console.error('[ERROR] 所有屏幕元素:', { loginScreen, waitingScreen, gameScreen, gameOverScreen });
        // 如果找不到目标屏幕，尝试通过ID直接获取
        const screenId = screenName === 'login' ? 'login-screen' :
                         screenName === 'waiting' ? 'waiting-screen' :
                         screenName === 'game' ? 'game-screen' :
                         screenName === 'gameOver' ? 'game-over-screen' :
                         screenName === 'opponent-left' ? 'opponent-left-screen' :
                         screenName === 'waiting-reconnect' ? 'waiting-reconnect-screen' : null;
        if (screenId) {
            const fallbackScreen = document.getElementById(screenId);
            if (fallbackScreen) {
                console.log('[DEBUG] 使用备用方法获取屏幕元素');
                // 隐藏所有屏幕
                document.querySelectorAll('.screen').forEach(s => {
                    s.classList.add('hidden');
                    s.style.display = 'none';
                });
                // 显示目标屏幕
                fallbackScreen.classList.remove('hidden');
                fallbackScreen.style.display = 'block';
            }
        }
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
    
    // 如果是单人模式，使用本地逻辑
    if (isSinglePlayerMode && singlePlayerGame) {
        handleSinglePlayerGuess(guess);
    } else if (isPracticeMode) {
        // 练习模式，发送到服务器（不限时）
        socket.emit('makeGuess', { guess });
        guessInput.disabled = false; // 练习模式下保持可用
        if (guessBtn) {
            guessBtn.disabled = false;
        }
    } else {
        // 多人模式，发送到服务器
        socket.emit('makeGuess', { guess });
        guessInput.disabled = true;
        if (guessBtn) {
            guessBtn.disabled = true;
        }
    }
    
    guessInput.value = '';
}

// 处理单人游戏猜测
function handleSinglePlayerGuess(guess) {
    if (!singlePlayerGame) return;
    
    singlePlayerGuessCount++;
    
    // 计算结果
    const result = calculateSinglePlayerResult(guess, singlePlayerGame.targetNumber);
    
    // 保存猜测记录
    singlePlayerGame.guesses.push({
        guess,
        result,
        timestamp: Date.now()
    });
    
    // 显示猜测结果
    const row = document.createElement('tr');
    row.className = 'my-guess';
    row.innerHTML = `
        <td>${playerName}</td>
        <td>${guess}</td>
        <td>${result.a}A${result.b}B</td>
    `;
    if (guessesBody) {
        guessesBody.appendChild(row);
        // 滚动到底部
        guessesBody.parentElement.scrollTop = guessesBody.parentElement.scrollHeight;
    }
    
    // 更新猜测次数
    if (timerDisplay) {
        timerDisplay.textContent = singlePlayerGuessCount;
    }
    
    // 检查是否猜中
    if (result.a === 4) {
        // 游戏结束
        handleSinglePlayerGameOver();
    } else {
        // 继续猜测，保持输入框可用
        const guessInput = document.getElementById('guess-input');
        if (guessInput) {
            guessInput.focus();
        }
    }
}

// 处理单人游戏结束
function handleSinglePlayerGameOver() {
    if (!singlePlayerGame) return;
    
    singlePlayerGame.isGameOver = true;
    
    const gameTime = Math.floor((Date.now() - singlePlayerStartTime) / 1000);
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    const timeString = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    
    // 显示游戏结束界面
    showScreen('gameOver');
    
    // 更新游戏结束界面
    if (gameResultTitle) {
        gameResultTitle.textContent = '🎉 恭喜，你猜中了！';
        gameResultTitle.className = 'winner';
    }
    
    if (correctNumber) {
        correctNumber.textContent = singlePlayerGame.targetNumber;
    }
    
    // 显示所有猜测记录
    if (finalGuessesBody) {
        finalGuessesBody.innerHTML = '';
        singlePlayerGame.guesses.forEach(guess => {
            const row = document.createElement('tr');
            row.className = 'my-guess';
            row.innerHTML = `
                <td>${playerName}</td>
                <td>${guess.guess}</td>
                <td>${guess.result.a}A${guess.result.b}B</td>
            `;
            finalGuessesBody.appendChild(row);
        });
    }
    
    // 添加游戏统计信息
    const statsInfo = document.createElement('div');
    statsInfo.className = 'single-player-stats';
    statsInfo.innerHTML = `
        <p>总猜测次数：<span class="highlight">${singlePlayerGuessCount}</span></p>
        <p>游戏用时：<span class="highlight">${timeString}</span></p>
    `;
    
    // 在游戏记录前插入统计信息
    const finalGuessesContainer = document.getElementById('final-guesses-container');
    if (finalGuessesContainer && !finalGuessesContainer.querySelector('.single-player-stats')) {
        finalGuessesContainer.insertBefore(statsInfo, finalGuessesContainer.firstChild);
    }
    
    // 播放胜利音效
    if (victorySound) {
        playSound(victorySound);
    }
    
    // 修改"再来一局"按钮行为
    if (restartBtn) {
        restartBtn.textContent = '再来一局';
        // 使用onclick直接设置，这样会覆盖之前的事件监听器
        restartBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSinglePlayerRestart();
        };
    }
    
    // 修改"退出"按钮行为
    if (exitBtn) {
        // 使用onclick直接设置，这样会覆盖之前的事件监听器
        exitBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSinglePlayerExit();
        };
    }
    
    // 隐藏restartStatus（单人模式不需要）
    if (restartStatus) {
        restartStatus.style.display = 'none';
    }
}

// 单人游戏再来一局
function handleSinglePlayerRestart() {
    // 重置游戏状态
    singlePlayerGuessCount = 0;
    singlePlayerStartTime = Date.now();
    singlePlayerGame = {
        targetNumber: generateSinglePlayerTarget(),
        guesses: [],
        isGameOver: false
    };
    
    console.log('[DEBUG] 单人游戏重新开始，新目标数字:', singlePlayerGame.targetNumber);
    
    // 返回游戏界面
    showScreen('game');
    updateUIForSinglePlayer();
    
    // 启用输入框
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    if (guessInput) {
        guessInput.disabled = false;
        guessInput.focus();
    }
    if (guessBtn) {
        guessBtn.disabled = false;
    }
    
    if (statusMessage) {
        statusMessage.textContent = '开始猜测吧！';
    }
    
    // 移除统计信息
    const statsInfo = document.querySelector('.single-player-stats');
    if (statsInfo) {
        statsInfo.remove();
    }
}

// 单人游戏退出
function handleSinglePlayerExit() {
    // 重置所有状态
    isSinglePlayerMode = false;
    singlePlayerGame = null;
    singlePlayerGuessCount = 0;
    singlePlayerStartTime = null;
    playerName = null;
    
    // 清空猜测记录
    if (guessesBody) guessesBody.innerHTML = '';
    if (finalGuessesBody) finalGuessesBody.innerHTML = '';
    
    // 返回登录界面
    showScreen('login');
    showCreateRoomSection(true);
    
    // 重置输入框
    if (playerNameInputCreate) {
        playerNameInputCreate.value = '';
    }
    
    // 移除统计信息
    const statsInfo = document.querySelector('.single-player-stats');
    if (statsInfo) {
        statsInfo.remove();
    }
}

// 这些事件监听器已经在 initializeEventListeners() 中绑定

// Socket事件监听

// 加入游戏成功
socket.on('gameJoined', (data) => {
    console.log('[CLIENT] ========== 收到 gameJoined 事件 ==========');
    console.log('[CLIENT] 数据:', JSON.stringify(data, null, 2));
    
    if (!data) {
        console.error('[ERROR] gameJoined 数据为空');
        return;
    }
    
    gameId = data.gameId;
    players = data.players || [];
    isJoiningRoom = false; // 重置标志
    
    // 保存token（如果服务器返回了token）
    if (data.token) {
        playerToken = data.token;
        savePlayerToken(gameId, data.token);
        // 保存玩家名称，用于自动重连
        try {
            localStorage.setItem(`player_name_${gameId}`, playerName);
        } catch (e) {
            console.error('[ERROR] 保存玩家名称失败:', e);
        }
        console.log('[CLIENT] Token已保存:', data.token);
    }
    
    console.log('[DEBUG] 当前 gameId:', gameId);
    console.log('[DEBUG] 当前 players:', players);
    console.log('[DEBUG] isFull:', data.isFull);
    console.log('[DEBUG] waitingScreen 元素:', waitingScreen);
    console.log('[DEBUG] loginScreen 元素:', loginScreen);
    
    // 隐藏房间状态消息
    hideRoomStatusMessage();
    
    // 清除所有错误消息
    if (loginErrorCreate) loginErrorCreate.style.display = 'none';
    if (loginErrorJoin) loginErrorJoin.style.display = 'none';
    
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
        console.log('[DEBUG] 生成邀请链接:', inviteLink);
        generateQRCode(inviteLink);
    }
    
    // 根据房间状态切换界面
    if (data.isFull) {
        console.log('[DEBUG] 房间已满，切换到游戏界面');
        showScreen('game');
    } else {
        console.log('[DEBUG] 房间未满，切换到等待界面');
        console.log('[DEBUG] 调用 showScreen("waiting") 前，waitingScreen:', waitingScreen);
        showScreen('waiting');
        console.log('[DEBUG] 调用 showScreen("waiting") 后，waitingScreen.classList:', waitingScreen ? waitingScreen.classList.toString() : 'null');
    }
    
    console.log('[CLIENT] ========== gameJoined 事件处理完成 ==========');
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
    // 这个事件在新的实现中已经被opponentLeft替代
    // 但保留它用于向后兼容
    if (statusMessage) {
        statusMessage.textContent = `${data.playerName || '对手'}已退出游戏`;
    }
});

// 对手断开连接
socket.on('opponentDisconnected', (data) => {
    console.log('[CLIENT] 对手断开连接', data);
    // 这个事件在新的实现中已经被opponentLeft替代
    // 但保留它用于向后兼容
    if (statusMessage) {
        statusMessage.textContent = `${data.playerName || '对手'}已断开连接`;
    }
});

// 对手退出 - 显示选择界面
socket.on('opponentLeft', (data) => {
    console.log('[CLIENT] 对手退出 - 显示选择界面', data);
    stopTimer(); // 停止计时器
    if (opponentLeftScreen && opponentNameDisplay) {
        opponentNameDisplay.textContent = `${data.playerName || '对手'}已退出`;
        showScreen('opponent-left');
    }
});

// 等待重连
socket.on('waitingForReconnect', (data) => {
    console.log('[CLIENT] 等待对手重连', data);
    showWaitingReconnectScreen(data.opponentName || '对手', data.timeout || 30);
});

// 重连成功
socket.on('reconnectSuccess', (data) => {
    console.log('[CLIENT] 重连成功', data);
    
    // 清理等待重连界面
    if (reconnectTimeoutTimer) {
        clearInterval(reconnectTimeoutTimer);
        reconnectTimeoutTimer = null;
    }
    
    gameId = data.gameId;
    players = data.players || [];
    
    // 如果游戏正在进行，恢复游戏状态
    if (data.gameState === 'playing') {
        showScreen('game');
        // 等待服务器发送yourTurn或waitForOpponent事件
    } else {
        // 游戏未开始，进入等待界面
        showScreen('waiting');
        if (currentPlayersDisplay) {
            currentPlayersDisplay.textContent = `${players.length}/2`;
        }
        updatePlayersList(players);
    }
});

// 对手重连成功
socket.on('opponentReconnected', (data) => {
    console.log('[CLIENT] 对手重连成功', data);
    if (statusMessage) {
        statusMessage.textContent = `${data.playerName || '对手'}已重新连接`;
    }
    // 如果当前在等待重连界面，关闭它
    if (waitingReconnectScreen && !waitingReconnectScreen.classList.contains('hidden')) {
        showScreen('game');
    }
});

// 重连超时
socket.on('reconnectTimeout', () => {
    console.log('[CLIENT] 重连超时');
    
    // 清理等待重连界面
    if (reconnectTimeoutTimer) {
        clearInterval(reconnectTimeoutTimer);
        reconnectTimeoutTimer = null;
    }
    
    // 显示对手退出选择界面
    if (opponentLeftScreen && opponentNameDisplay) {
        opponentNameDisplay.textContent = '对手重连超时';
        showScreen('opponent-left');
    }
});

// 练习模式开始
socket.on('practiceModeStarted', (data) => {
    console.log('[CLIENT] 练习模式开始', data);
    
    isPracticeMode = true;
    gameId = data.gameId;
    players = data.players || [];
    
    // 确保playerName被设置（如果还没有）
    if (!playerName && players.length > 0) {
        playerName = players[0].name;
    }
    
    // 切换到游戏界面
    showScreen('game');
    
    // 更新界面
    if (gamePlayersList) {
        gamePlayersList.textContent = playerName || '玩家';
    }
    
    if (statusMessage) {
        statusMessage.textContent = '练习模式 - 开始猜测吧！';
    }
    
    // 清空猜测记录
    if (guessesBody) {
        guessesBody.innerHTML = '';
    }
    
    // 确保输入框和按钮可用
    const guessInput = document.getElementById('guess-input');
    const guessBtn = document.getElementById('guess-btn');
    if (guessInput) {
        guessInput.disabled = false;
        guessInput.focus();
    }
    if (guessBtn) {
        guessBtn.disabled = false;
    }
    
    // 更新计时器显示（练习模式下不显示倒计时）
    if (timerDisplay) {
        const gameInfo = document.querySelector('.game-info');
        if (gameInfo) {
            const infoItems = gameInfo.querySelectorAll('.info-item');
            if (infoItems.length > 1 && infoItems[1]) {
                const label = infoItems[1].querySelector('span:first-child');
                if (label) {
                    label.textContent = '练习模式：';
                }
                if (timerDisplay) {
                    timerDisplay.textContent = '无限制';
                }
            }
        }
    }
});

// Token验证失败 - 房间等待原玩家重连
socket.on('tokenRequired', (data) => {
    console.log('[CLIENT] Token验证失败 - 房间等待原玩家重连', data);
    if (loginErrorJoin) {
        showError(loginErrorJoin, data.message || '房间正在等待原玩家重连，无法加入');
    }
    if (roomStatusMessage) {
        showRoomStatusMessage(data.message || '房间正在等待原玩家重连，无法加入', 'error');
    }
});

// 显示等待重连界面
function showWaitingReconnectScreen(opponentName, timeout) {
    if (!waitingReconnectScreen) return;
    
    if (reconnectOpponentName) {
        reconnectOpponentName.textContent = `等待${opponentName}重连...`;
    }
    
    let timeLeft = timeout || 30;
    if (reconnectTimer) {
        reconnectTimer.textContent = timeLeft;
    }
    
    showScreen('waiting-reconnect');
    
    // 开始倒计时
    if (reconnectTimeoutTimer) {
        clearInterval(reconnectTimeoutTimer);
    }
    
    reconnectTimeoutTimer = setInterval(() => {
        timeLeft--;
        if (reconnectTimer) {
            reconnectTimer.textContent = timeLeft;
        }
        if (timeLeft <= 0) {
            clearInterval(reconnectTimeoutTimer);
            reconnectTimeoutTimer = null;
            // 服务器会发送reconnectTimeout事件，这里不需要额外处理
        }
    }, 1000);
}

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
    // 如果正在加入房间，不执行自动检测
    if (isJoiningRoom) {
        console.log('[DEBUG] 正在加入房间，跳过自动检测');
        return;
    }
    
    const roomId = getRoomIdFromURL();
    
    if (roomId) {
        console.log('[DEBUG] 检测到URL中的房间ID:', roomId);
        
        // 检查是否有保存的token（尝试自动重连）
        const savedToken = getPlayerToken(roomId);
        if (savedToken) {
            console.log('[DEBUG] 检测到保存的token，尝试自动重连');
            // 尝试从localStorage获取玩家名称
            const savedPlayerName = localStorage.getItem(`player_name_${roomId}`);
            if (savedPlayerName && playerNameInputJoin) {
                playerNameInputJoin.value = savedPlayerName;
                playerName = savedPlayerName;
            }
            
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
            
            // 自动尝试重连
            if (!socket.connected) {
                socket.connect();
                socket.once('connect', () => {
                    socket.emit('joinGame', { gameId: roomId, playerName: savedPlayerName || '', token: savedToken });
                });
            } else {
                socket.emit('joinGame', { gameId: roomId, playerName: savedPlayerName || '', token: savedToken });
            }
            return;
        }
        
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
