class Game {
  constructor() {
    this.players = [];      // 玩家列表: [{ id, name }]
    this.targetNumber = this.generateNumber();  // 目标数字
    this.guesses = [];      // 猜测记录
    this.currentPlayerIndex = 0;  // 当前玩家索引
    this.restartRequests = new Set();  // 重启请求集合
    this.isGameStarted = false;  // 游戏是否已开始
  }

  // 生成4位不重复数字
  generateNumber() {
    const digits = new Set();
    while (digits.size < 4) {
      digits.add(Math.floor(Math.random() * 10));
    }
    return Array.from(digits).join('');
  }

  // 添加玩家
  addPlayer(player) {
    if (this.players.length >= 2) {
      throw new Error('房间已满');
    }
    // 检查是否已存在同名玩家
    if (this.players.some(p => p.name === player.name && p.id !== player.id)) {
      throw new Error('该名称已被使用');
    }
    this.players.push(player);
  }

  // 移除玩家
  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    // 如果移除的是当前玩家，切换到下一个玩家
    const removedIndex = this.players.findIndex(p => p.id === playerId);
    if (removedIndex !== -1 && removedIndex <= this.currentPlayerIndex) {
      this.currentPlayerIndex = Math.max(0, this.currentPlayerIndex - 1);
    }
    // 更新当前玩家索引
    this.currentPlayerIndex = this.currentPlayerIndex % Math.max(1, this.players.length);
  }

  // 开始游戏
  start() {
    if (this.players.length !== 2) {
      throw new Error('需要2位玩家才能开始游戏');
    }
    this.isGameStarted = true;
    this.currentPlayerIndex = Math.random() < 0.5 ? 0 : 1;
    return this.getCurrentPlayer();
  }

  // 获取当前玩家
  getCurrentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.currentPlayerIndex];
  }

  // 切换到下一个玩家
  switchPlayer() {
    if (this.players.length === 2) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    }
    return this.getCurrentPlayer();
  }

  // 处理猜测
  makeGuess(playerId, guess) {
    if (!this.players.some(p => p.id === playerId)) {
      throw new Error('玩家不在本局游戏中');
    }

    // 检查是否轮到该玩家
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error('还没轮到你');
    }

    // 处理超时
    if (guess === 'timeout') {
      this.guesses.push({ 
        player: playerId, 
        guess: '超时', 
        result: { a: 0, b: 0 },
        timestamp: Date.now()
      });
      this.switchPlayer();
      return { a: 0, b: 0 };
    }

    // 验证猜测格式
    if (!/^\d{4}$/.test(guess) || new Set(guess).size !== 4) {
      throw new Error('请输入4位不重复的数字');
    }

    // 计算A和B
    const result = this.calculateResult(guess);
    this.guesses.push({ 
      player: playerId, 
      guess, 
      result,
      timestamp: Date.now()
    });
    
    // 如果没猜中，切换玩家
    if (result.a !== 4) {
      this.switchPlayer();
    }
    
    return result;
  }

  // 计算A和B
  calculateResult(guess) {
    let a = 0, b = 0;
    for (let i = 0; i < 4; i++) {
      if (guess[i] === this.targetNumber[i]) {
        a++;
      } else if (this.targetNumber.includes(guess[i])) {
        b++;
      }
    }
    return { a, b };
  }

  // 检查游戏是否结束
  isGameOver() {
    if (this.guesses.length === 0) return false;
    const lastGuess = this.guesses[this.guesses.length - 1];
    return lastGuess && lastGuess.result.a === 4;
  }

  // 请求重启
  requestRestart(playerId) {
    this.restartRequests.add(playerId);
    return this.restartRequests.size === 2;
  }

  // 重置游戏
  reset() {
    this.targetNumber = this.generateNumber();
    this.guesses = [];
    this.restartRequests = new Set();
    this.currentPlayerIndex = Math.random() < 0.5 ? 0 : 1;
    this.isGameStarted = false;
    console.log('游戏已重置，目标数字为:', this.targetNumber);
  }

  // 获取玩家信息
  getPlayerInfo(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;
    return {
      id: player.id,
      name: player.name,
      isCurrentPlayer: this.getCurrentPlayer()?.id === playerId
    };
  }
}

module.exports = Game;
