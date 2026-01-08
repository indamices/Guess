# 四位数字猜谜游戏 🎮

一个基于 Node.js + Socket.IO 的在线多人猜数字游戏。支持多房间、实时对战、移动端优化。

## ✨ 功能特性

- 🎯 **多房间支持** - 通过房间ID创建或加入游戏
- 👥 **双人对战** - 实时在线对战
- ⏱️ **计时器功能** - 每回合60秒倒计时
- 📱 **移动端优化** - 完美适配手机和平板
- 🎵 **音效提示** - 轮到自己、胜利、失败提示音
- 🔗 **邀请功能** - 二维码和链接分享
- 🔄 **再来一局** - 双方确认后重新开始
- 💬 **实时通信** - WebSocket实时同步游戏状态

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务器

```bash
npm start
```

服务器将在 `http://localhost:3000` 启动

### 访问游戏

在浏览器中打开 `http://localhost:3000`

## 📱 移动端测试

### 方法1：局域网测试

1. 获取本机IP地址（Windows: `ipconfig`, Mac/Linux: `ifconfig`）
2. 确保手机和电脑在同一WiFi网络
3. 手机浏览器访问：`http://你的IP:3000`

### 方法2：使用ngrok（公网测试）

```bash
# 安装ngrok后
ngrok http 3000
```

使用ngrok提供的公网地址进行测试。

## 🎮 游戏规则

1. 系统随机生成一个4位不重复的数字（0-9）
2. 两位玩家轮流猜测
3. 每次猜测后显示结果：
   - **A** = 数字和位置都正确
   - **B** = 数字正确但位置错误
   - 例如：`2A1B` 表示2个数字位置都对，1个数字对但位置错
4. 先猜中 `4A0B` 的玩家获胜
5. 每回合60秒，超时自动跳过

## 🛠️ 技术栈

- **后端**: Node.js + Express + Socket.IO
- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **实时通信**: WebSocket
- **移动端**: 响应式设计，触摸优化

## 📁 项目结构

```
guess-number-game/
├── server.js              # 服务器主文件
├── src/
│   └── game-logic.js      # 游戏逻辑模块
├── public/
│   ├── index.html         # 前端页面
│   ├── app.js             # 前端逻辑
│   ├── style.css          # 样式文件
│   └── *.mp3              # 音效文件
├── package.json           # 项目配置
└── README.md              # 说明文档
```

## 🌐 部署

### Render 部署（推荐）

1. 访问 [Render](https://render.com)
2. 连接GitHub仓库
3. 创建 Web Service
4. 设置：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 环境变量（可选）：
   - `PORT`: 端口号（Render会自动设置）

### 其他平台

- **Heroku**: 支持，需要配置Procfile
- **Railway**: 支持，自动检测Node.js
- **Vercel**: 需要配置serverless函数

## 📝 开发

### 运行测试

```bash
npm test
```

### 开发模式

```bash
npm run dev
```

## 🐛 问题排查

如果遇到问题，请查看 [测试指南](TESTING_GUIDE.md)

常见问题：
- **连接失败**: 检查服务器是否运行，防火墙是否阻止端口
- **移动端无响应**: 清除浏览器缓存，检查控制台错误
- **Socket.IO错误**: 确保网络连接正常

## 📄 许可证

ISC

## 👨‍💻 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题或建议，请提交 Issue。

---

**享受游戏！** 🎉
