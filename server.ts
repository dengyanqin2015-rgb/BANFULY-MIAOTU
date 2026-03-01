import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import cors from "cors";
import pg from "pg";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "banfuly-secret-key-12345";
const DB_FILE = path.resolve(process.env.DB_PATH || "db.json");
const DATABASE_URL = process.env.DATABASE_URL;

console.log("Database configuration:");
console.log("- File path:", DB_FILE);
console.log("- PostgreSQL:", DATABASE_URL ? "Enabled" : "Disabled");

// --- Database Interfaces ---
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

// --- Database Service ---
class DatabaseService {
  private pool: pg.Pool | null = null;
  private fileData: DBData | null = null;

  constructor() {
    console.log("Database connection check: DATABASE_URL is", DATABASE_URL ? "set" : "NOT set");
    if (DATABASE_URL) {
      console.log("PostgreSQL: Enabled. Initializing pool...");
      this.pool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
    }
  }

  async init() {
    if (this.pool) {
      try {
        console.log("PostgreSQL: Initializing tables...");
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            credits INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS recharge_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            amount INTEGER NOT NULL,
            previous_credits INTEGER NOT NULL,
            new_credits INTEGER NOT NULL,
            timestamp BIGINT NOT NULL,
            admin_id TEXT NOT NULL,
            admin_name TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS generation_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp BIGINT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS image_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            image_url TEXT NOT NULL,
            prompt TEXT NOT NULL,
            timestamp BIGINT NOT NULL
          );
        `);

        // Check if admin exists
        const adminCheck = await this.pool.query("SELECT * FROM users WHERE username = 'admin'");
        if (adminCheck.rows.length === 0) {
          console.log("Creating default admin user in Postgres...");
          await this.pool.query(
            "INSERT INTO users (id, username, password, role, credits) VALUES ($1, $2, $3, $4, $5)",
            ["admin-1", "admin", bcrypt.hashSync("admin123", 10), "admin", 9999]
          );
        }
        console.log("PostgreSQL initialized.");
      } catch (err) {
        console.error("PostgreSQL initialization failed, falling back to file:", err);
        this.pool = null;
        this.initFileDB();
      }
    } else {
      this.initFileDB();
    }
  }

  private initFileDB() {
    if (!fs.existsSync(DB_FILE)) {
      console.log("Initializing new database file...");
      this.fileData = {
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
      this.saveFileDB();
    } else {
      try {
        this.fileData = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
        // Ensure arrays exist
        if (!this.fileData!.rechargeLogs) this.fileData!.rechargeLogs = [];
        if (!this.fileData!.generationLogs) this.fileData!.generationLogs = [];
        if (!this.fileData!.imageHistory) this.fileData!.imageHistory = [];
      } catch (err) {
        console.error("Failed to read db.json:", err);
        this.fileData = { users: [], rechargeLogs: [], generationLogs: [], imageHistory: [] };
      }
    }
  }

  private saveFileDB() {
    if (this.fileData) {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.fileData, null, 2));
    }
  }

  // --- User Methods ---
  async getUsers(): Promise<UserData[]> {
    if (this.pool) {
      const res = await this.pool.query("SELECT id, username, role, credits FROM users");
      return res.rows;
    }
    return this.fileData!.users.map(({ id, username, role, credits }) => ({ id, username, role, credits }));
  }

  async findUserByUsername(username: string): Promise<UserData | null> {
    if (this.pool) {
      const res = await this.pool.query("SELECT * FROM users WHERE username = $1", [username]);
      return res.rows[0] || null;
    }
    return this.fileData!.users.find(u => u.username === username) || null;
  }

  async findUserById(id: string): Promise<UserData | null> {
    if (this.pool) {
      const res = await this.pool.query("SELECT id, username, role, credits FROM users WHERE id = $1", [id]);
      return res.rows[0] || null;
    }
    return this.fileData!.users.find(u => u.id === id) || null;
  }

  async createUser(user: UserData) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO users (id, username, password, role, credits) VALUES ($1, $2, $3, $4, $5)",
        [user.id, user.username, user.password, user.role, user.credits]
      );
    } else {
      this.fileData!.users.push(user);
      this.saveFileDB();
    }
  }

  async updateUserCredits(userId: string, credits: number) {
    if (this.pool) {
      await this.pool.query("UPDATE users SET credits = $1 WHERE id = $2", [credits, userId]);
    } else {
      const user = this.fileData!.users.find(u => u.id === userId);
      if (user) {
        user.credits = credits;
        this.saveFileDB();
      }
    }
  }

  async updateUserRole(userId: string, role: 'admin' | 'user') {
    if (this.pool) {
      await this.pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
    } else {
      const user = this.fileData!.users.find(u => u.id === userId);
      if (user) {
        user.role = role;
        this.saveFileDB();
      }
    }
  }

  async updateUserPassword(userId: string, passwordHash: string) {
    if (this.pool) {
      await this.pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, userId]);
    } else {
      const user = this.fileData!.users.find(u => u.id === userId);
      if (user) {
        user.password = passwordHash;
        this.saveFileDB();
      }
    }
  }

  // --- Log Methods ---
  async addRechargeLog(log: RechargeLog) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO recharge_logs (id, user_id, username, amount, previous_credits, new_credits, timestamp, admin_id, admin_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [log.id, log.userId, log.username, log.amount, log.previousCredits, log.newCredits, log.timestamp, log.adminId, log.adminName]
      );
    } else {
      this.fileData!.rechargeLogs.push(log);
      this.saveFileDB();
    }
  }

  async getRechargeLogs(userId?: string): Promise<RechargeLog[]> {
    if (this.pool) {
      const query = userId 
        ? "SELECT id, user_id as \"userId\", username, amount, previous_credits as \"previousCredits\", new_credits as \"newCredits\", timestamp, admin_id as \"adminId\", admin_name as \"adminName\" FROM recharge_logs WHERE user_id = $1 ORDER BY timestamp DESC"
        : "SELECT id, user_id as \"userId\", username, amount, previous_credits as \"previousCredits\", new_credits as \"newCredits\", timestamp, admin_id as \"adminId\", admin_name as \"adminName\" FROM recharge_logs ORDER BY timestamp DESC";
      const res = await this.pool.query(query, userId ? [userId] : []);
      return res.rows;
    }
    const logs = userId ? this.fileData!.rechargeLogs.filter(l => l.userId === userId) : this.fileData!.rechargeLogs;
    return [...logs].sort((a, b) => b.timestamp - a.timestamp);
  }

  async addGenerationLog(log: GenerationLog) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO generation_logs (id, user_id, username, timestamp) VALUES ($1, $2, $3, $4)",
        [log.id, log.userId, log.username, log.timestamp]
      );
    } else {
      this.fileData!.generationLogs.push(log);
      this.saveFileDB();
    }
  }

  async getGenerationLogs(userId?: string): Promise<GenerationLog[]> {
    if (this.pool) {
      const query = userId 
        ? "SELECT id, user_id as \"userId\", username, timestamp FROM generation_logs WHERE user_id = $1 ORDER BY timestamp DESC"
        : "SELECT id, user_id as \"userId\", username, timestamp FROM generation_logs ORDER BY timestamp DESC";
      const res = await this.pool.query(query, userId ? [userId] : []);
      return res.rows;
    }
    const logs = userId ? this.fileData!.generationLogs.filter(l => l.userId === userId) : this.fileData!.generationLogs;
    return [...logs].sort((a, b) => b.timestamp - a.timestamp);
  }

  async addImageHistory(history: ImageHistory) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO image_history (id, user_id, username, image_url, prompt, timestamp) VALUES ($1, $2, $3, $4, $5, $6)",
        [history.id, history.userId, history.username, history.imageUrl, history.prompt, history.timestamp]
      );
      // Optional: cleanup old history for user in Postgres too if needed
    } else {
      this.fileData!.imageHistory.push(history);
      const userHistory = this.fileData!.imageHistory.filter(h => h.userId === history.userId);
      if (userHistory.length > 60) {
        userHistory.sort((a, b) => b.timestamp - a.timestamp);
        const toRemove = userHistory.slice(60);
        const removeIds = new Set(toRemove.map(h => h.id));
        this.fileData!.imageHistory = this.fileData!.imageHistory.filter(h => !removeIds.has(h.id));
      }
      this.saveFileDB();
    }
  }

  async getImageHistory(userId?: string): Promise<ImageHistory[]> {
    if (this.pool) {
      const query = userId 
        ? "SELECT id, user_id as \"userId\", username, image_url as \"imageUrl\", prompt, timestamp FROM image_history WHERE user_id = $1 ORDER BY timestamp DESC"
        : "SELECT id, user_id as \"userId\", username, image_url as \"imageUrl\", prompt, timestamp FROM image_history ORDER BY timestamp DESC";
      const res = await this.pool.query(query, userId ? [userId] : []);
      return res.rows;
    }
    const history = userId ? this.fileData!.imageHistory.filter(h => h.userId === userId) : this.fileData!.imageHistory;
    return [...history].sort((a, b) => b.timestamp - a.timestamp);
  }

  async deleteImageHistory(id: string, userId: string, isAdmin: boolean) {
    if (this.pool) {
      if (isAdmin) {
        await this.pool.query("DELETE FROM image_history WHERE id = $1", [id]);
      } else {
        await this.pool.query("DELETE FROM image_history WHERE id = $1 AND user_id = $2", [id, userId]);
      }
    } else {
      const index = this.fileData!.imageHistory.findIndex(h => h.id === id && (h.userId === userId || isAdmin));
      if (index !== -1) {
        this.fileData!.imageHistory.splice(index, 1);
        this.saveFileDB();
      }
    }
  }
}

const db = new DatabaseService();
db.init();

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

app.get("/api/test", async (req, res) => {
  console.log("API Test hit");
  res.json({ 
    message: "API is working", 
    timestamp: Date.now(), 
    env: process.env.NODE_ENV,
    dbMode: DATABASE_URL ? "PostgreSQL" : "File"
  });
});

app.post(["/api/auth/register", "/api/auth/register/"], async (req: Request, res: Response) => {
  console.log("Received register request for user:", req.body.username);
  const { username, password } = req.body;
  const existingUser = await db.findUserByUsername(username);
  if (existingUser) {
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
    await db.createUser(newUser);
    res.json({ message: "注册成功" });
  } catch (err) {
    console.error("注册失败:", err);
    res.status(500).json({ message: "注册失败，服务器内部错误" });
  }
});

app.post(["/api/auth/login", "/api/auth/login/"], async (req: Request, res: Response) => {
  console.log("Received login request for user:", req.body.username);
  const { username, password } = req.body;
  const user = await db.findUserByUsername(username);
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

app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = await db.findUserById(req.user?.id || "");
  if (!user) return res.status(404).json({ message: "用户不存在" });
  res.json({ id: user.id, username: user.username, role: user.role, credits: user.credits });
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ message: "已退出登录" });
});

app.post("/api/user/deduct-credit", authenticateToken, async (req: AuthRequest, res: Response) => {
  const user = await db.findUserById(req.user?.id || "");
  if (!user) return res.status(404).json({ message: "用户不存在" });
  if (user.credits <= 0) return res.status(400).json({ message: "点数不足" });
  
  const newCredits = user.credits - 1;
  await db.updateUserCredits(user.id, newCredits);
  await db.addGenerationLog({
    id: Date.now().toString(),
    userId: user.id,
    username: user.username,
    timestamp: Date.now()
  });
  
  res.json({ credits: newCredits });
});

app.get("/api/admin/users", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const users = await db.getUsers();
  res.json(users);
});

app.post("/api/admin/users/:id/credits", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const { credits } = req.body;
  const { id } = req.params;
  const user = await db.findUserById(id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  const previousCredits = user.credits;
  const newCredits = parseInt(credits);
  const amount = newCredits - previousCredits;
  
  await db.updateUserCredits(user.id, newCredits);
  await db.addRechargeLog({
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
  
  res.json({ message: "更新成功", user: { id: user.id, username: user.username, role: user.role, credits: newCredits } });
});

app.get("/api/admin/recharge-logs", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const logs = await db.getRechargeLogs();
  res.json(logs);
});

app.get("/api/admin/generation-logs", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const logs = await db.getGenerationLogs();
  res.json(logs);
});

app.post("/api/admin/users/:id/role", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  const { id } = req.params;
  const user = await db.findUserById(id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  await db.updateUserRole(id, role);
  res.json({ message: "更新成功", user: { id: user.id, username: user.username, role: role, credits: user.credits } });
});

app.post("/api/admin/users/:id/reset-password", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const user = await db.findUserById(id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  const newPasswordHash = await bcrypt.hash("123456", 10);
  await db.updateUserPassword(id, newPasswordHash);
  res.json({ message: "密码已重置为 123456" });
});

app.post("/api/user/change-password", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  const user = await db.findUserByUsername(req.user?.username || "");
  
  if (!user || !user.password) return res.status(404).json({ message: "用户不存在" });
  
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) return res.status(400).json({ message: "原密码错误" });
  
  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await db.updateUserPassword(user.id, newPasswordHash);
  res.json({ message: "密码修改成功" });
});

app.get("/api/user/recharge-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
  const logs = await db.getRechargeLogs(req.user?.id);
  res.json(logs);
});

app.get("/api/user/generation-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
  const logs = await db.getGenerationLogs(req.user?.id);
  res.json(logs);
});

app.post("/api/user/history", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { imageUrl, prompt } = req.body;
  
  const newHistory: ImageHistory = {
    id: Date.now().toString(),
    userId: req.user?.id || "unknown",
    username: req.user?.username || "unknown",
    imageUrl,
    prompt,
    timestamp: Date.now()
  };
  
  await db.addImageHistory(newHistory);
  res.json({ message: "已保存至历史记录" });
});

app.get("/api/user/history", authenticateToken, async (req: AuthRequest, res: Response) => {
  const history = await db.getImageHistory(req.user?.id);
  res.json(history);
});

app.get("/api/admin/history", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const history = await db.getImageHistory();
  res.json(history);
});

app.delete("/api/user/history/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await db.deleteImageHistory(id, req.user?.id || "", req.user?.role === 'admin');
  res.json({ message: "已删除" });
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
      app.get(/.*/, (req, res) => {
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
