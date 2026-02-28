import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "banfuly-secret-key-12345";
const DB_FILE = path.resolve(process.env.DB_PATH || "db.json");
console.log("Database file path:", DB_FILE);

interface UserData {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'user';
  credits: number;
}

interface RechargeLog {
  id: string;
  userId: string;
  username: string;
  amount: number;
  previousCredits: number;
  newCredits: number;
  timestamp: number;
  adminId: string;
  adminName: string;
}

interface GenerationLog {
  id: string;
  userId: string;
  username: string;
  timestamp: number;
}

interface ImageHistory {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
}

interface DBData {
  users: UserData[];
  rechargeLogs: RechargeLog[];
  generationLogs: GenerationLog[];
  imageHistory: ImageHistory[];
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'admin' | 'user';
  };
}

// Initialize DB
const initializeDB = () => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      console.log("Initializing new database file...");
      const initialData = {
        users: [
          {
            id: "admin-1",
            username: "admin",
            password: bcrypt.hashSync("admin123", 10),
            role: "admin",
            credits: 9999
          }
        ],
        rechargeLogs: [],
        generationLogs: [],
        imageHistory: []
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
      console.log("Database initialized successfully.");
    } else {
      console.log("Database file already exists.");
    }
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
};

initializeDB();

const getDB = (): DBData => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      initializeDB();
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    if (!data.rechargeLogs) data.rechargeLogs = [];
    if (!data.generationLogs) data.generationLogs = [];
    if (!data.imageHistory) data.imageHistory = [];
    return data;
  } catch (err) {
    console.error("读取数据库失败:", err);
    return { users: [], rechargeLogs: [], generationLogs: [], imageHistory: [] };
  }
};
const saveDB = (data: DBData) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("数据库写入失败:", err);
  }
};

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(cors());

// 全局请求日志中间件
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// --- Auth Middleware ---
const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "未登录" });

  jwt.verify(token, JWT_SECRET, (err: jwt.VerifyErrors | null, user: string | jwt.JwtPayload | undefined) => {
    if (err) return res.status(403).json({ message: "登录失效" });
    req.user = user as { id: string; username: string; role: 'admin' | 'user' };
    next();
  });
};

const isAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "权限不足" });
  next();
};

// --- API Routes (REGISTERED FIRST) ---

app.get("/api/test", (req, res) => {
  console.log("API Test hit");
  res.json({ 
    message: "API is working", 
    timestamp: Date.now(), 
    env: process.env.NODE_ENV,
    dbPath: DB_FILE 
  });
});

app.post(["/api/auth/register", "/api/auth/register/"], async (req: Request, res: Response) => {
  console.log("Received register request for user:", req.body.username);
  const { username, password } = req.body;
  const db = getDB();
  if (db.users.find((u: UserData) => u.username === username)) {
    return res.status(400).json({ message: "用户名已存在" });
  }
  const newUser: UserData = {
    id: Date.now().toString(),
    username,
    password: await bcrypt.hash(password, 10),
    role: "user",
    credits: 10 // Default credits
  };
  try {
    db.users.push(newUser);
    saveDB(db);
    res.json({ message: "注册成功" });
  } catch (err) {
    console.error("注册失败:", err);
    res.status(500).json({ message: "注册失败，服务器内部错误" });
  }
});

app.post(["/api/auth/login", "/api/auth/login/"], async (req: Request, res: Response) => {
  console.log("Received login request for user:", req.body.username);
  const { username, password } = req.body;
  const db = getDB();
  const user = db.users.find((u: UserData) => u.username === username);
  if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: "用户名或密码错误" });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  
  const isSecure = req.protocol === 'https' || process.env.NODE_ENV === 'production';
  res.cookie("token", token, { 
    httpOnly: true, 
    secure: isSecure, 
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, credits: user.credits } });
});

app.get("/api/auth/me", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  res.json({ id: user.id, username: user.username, role: user.role, credits: user.credits });
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ message: "已退出登录" });
});

app.post("/api/user/deduct-credit", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === req.user?.id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  if (user.credits <= 0) return res.status(400).json({ message: "点数不足" });
  
  user.credits -= 1;
  db.generationLogs.push({
    id: Date.now().toString(),
    userId: user.id,
    username: user.username,
    timestamp: Date.now()
  });
  
  saveDB(db);
  res.json({ credits: user.credits });
});

app.get("/api/admin/users", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  res.json(db.users.map((u: UserData) => ({ id: u.id, username: u.username, role: u.role, credits: u.credits })));
});

app.post("/api/admin/users/:id/credits", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const { credits } = req.body;
  const { id } = req.params;
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  const previousCredits = user.credits;
  const newCredits = parseInt(credits);
  const amount = newCredits - previousCredits;
  user.credits = newCredits;
  
  db.rechargeLogs.push({
    id: Date.now().toString(),
    userId: user.id,
    username: user.username,
    amount: amount,
    previousCredits: previousCredits,
    newCredits: newCredits,
    timestamp: Date.now(),
    adminId: req.user?.id || "unknown",
    adminName: req.user?.username || "unknown"
  });
  
  saveDB(db);
  res.json({ message: "更新成功", user: { id: user.id, username: user.username, role: user.role, credits: user.credits } });
});

app.get("/api/admin/recharge-logs", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  res.json(db.rechargeLogs.sort((a, b) => b.timestamp - a.timestamp));
});

app.get("/api/admin/generation-logs", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  res.json(db.generationLogs.sort((a, b) => b.timestamp - a.timestamp));
});

app.post("/api/admin/users/:id/role", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  const { id } = req.params;
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  user.role = role as 'admin' | 'user';
  saveDB(db);
  res.json({ message: "更新成功", user: { id: user.id, username: user.username, role: user.role, credits: user.credits } });
});

app.post("/api/admin/users/:id/reset-password", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  user.password = await bcrypt.hash("123456", 10);
  saveDB(db);
  res.json({ message: "密码已重置为 123456" });
});

app.post("/api/user/change-password", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const db = getDB();
  const user = db.users.find((u: UserData) => u.id === req.user?.id);
  
  if (!user || !user.password) return res.status(404).json({ message: "用户不存在" });
  
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) return res.status(400).json({ message: "原密码错误" });
  
  user.password = await bcrypt.hash(newPassword, 10);
  saveDB(db);
  res.json({ message: "密码修改成功" });
});

app.get("/api/user/recharge-logs", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const logs = db.rechargeLogs.filter(log => log.userId === req.user?.id);
  res.json(logs.sort((a, b) => b.timestamp - a.timestamp));
});

app.get("/api/user/generation-logs", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const logs = db.generationLogs.filter(log => log.userId === req.user?.id);
  res.json(logs.sort((a, b) => b.timestamp - a.timestamp));
});

app.post("/api/user/history", authenticateToken, (req: AuthRequest, res: Response) => {
  const { imageUrl, prompt } = req.body;
  const db = getDB();
  
  const newHistory: ImageHistory = {
    id: Date.now().toString(),
    userId: req.user?.id || "unknown",
    username: req.user?.username || "unknown",
    imageUrl,
    prompt,
    timestamp: Date.now()
  };
  
  db.imageHistory.push(newHistory);
  const userHistory = db.imageHistory.filter(h => h.userId === req.user?.id);
  if (userHistory.length > 60) {
    userHistory.sort((a, b) => b.timestamp - a.timestamp);
    const toRemove = userHistory.slice(60);
    const removeIds = new Set(toRemove.map(h => h.id));
    db.imageHistory = db.imageHistory.filter(h => !removeIds.has(h.id));
  }
  
  saveDB(db);
  res.json({ message: "已保存至历史记录" });
});

app.get("/api/user/history", authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const history = db.imageHistory.filter(h => h.userId === req.user?.id);
  res.json(history.sort((a, b) => b.timestamp - a.timestamp));
});

app.get("/api/admin/history", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  res.json(db.imageHistory.sort((a, b) => b.timestamp - a.timestamp));
});

app.delete("/api/user/history/:id", authenticateToken, (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const db = getDB();
  const index = db.imageHistory.findIndex(h => h.id === id && (h.userId === req.user?.id || req.user?.role === 'admin'));
  if (index !== -1) {
    db.imageHistory.splice(index, 1);
    saveDB(db);
    return res.json({ message: "已删除" });
  }
  res.status(404).json({ message: "记录不存在" });
});

// --- Vite Integration ---
async function startServer() {
  // 2. Static files or Vite middleware (AFTER API routes)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve("dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("/:path*", (req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn("Warning: dist folder not found. Static files will not be served.");
    }
  }

  // Fallback for unmatched API routes to prevent them from returning HTML
  app.use("/api", (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  const PORT = process.env.PORT || 3000;

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
