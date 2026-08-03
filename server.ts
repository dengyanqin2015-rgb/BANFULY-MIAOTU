import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import cors from "cors";
import pg from "pg";
import { ImageRequestDeduplicator, OPENAI_IMAGE_TOTAL_TIMEOUT_MS, normalizeImageRequestId } from "./src/lib/openAiImageRuntime";
import { aggregateGenerationTrend, type GenerationTrendBucket, type GenerationTrendGranularity } from "./src/lib/generationStats";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : "banfuly-local-dev-secret-change-me");
if (!JWT_SECRET) {
  throw new Error("Production requires JWT_SECRET");
}
const getInitialAdminPassword = () => {
  const password = process.env.ADMIN_INITIAL_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "admin123");
  if (!password) throw new Error("Production requires ADMIN_INITIAL_PASSWORD when creating the first admin");
  return password;
};
const DB_FILE = path.resolve(process.env.DB_PATH || "data/db.json");
const IMAGE_ANALYSIS_TEMPLATES_FILE = path.resolve(process.env.IMAGE_ANALYSIS_TEMPLATES_PATH || "data/image-analysis-templates.json");
const REQUEST_LOG_FILE = path.resolve(process.env.REQUEST_LOG_PATH || "data/request-logs.jsonl");
const DATABASE_URL = process.env.DATABASE_URL;
const openAiImageRequestDeduplicator = new ImageRequestDeduplicator();

interface RequestLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  user?: { id?: string; username?: string; role?: string };
  ip?: string;
  requestHeaders: Record<string, unknown>;
  requestBody?: unknown;
  responseBody?: unknown;
}

const sensitiveKeyPattern = /password|passcode|secret|token|authorization|cookie|api[-_]?key/i;
const sanitizeLogValue = (value: unknown, key = "", depth = 0): unknown => {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (depth > 6) return "[MAX_DEPTH]";
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/i.test(value)) {
      const commaIndex = value.indexOf(",");
      return `[BASE64_IMAGE ${Math.max(0, value.length - commaIndex - 1)} chars]`;
    }
    if ((key === "data" || key === "b64_json" || key === "imageBytes") && value.length > 1000) {
      return `[BASE64_DATA ${value.length} chars]`;
    }
    if (value.length > 4000) return `${value.slice(0, 4000)}…[TRUNCATED ${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map(item => sanitizeLogValue(item, key, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([childKey, childValue]) => [childKey, sanitizeLogValue(childValue, childKey, depth + 1)])
    );
  }
  return value;
};

const appendRequestLog = (entry: RequestLogEntry) => {
  try {
    fs.mkdirSync(path.dirname(REQUEST_LOG_FILE), { recursive: true });
    if (fs.existsSync(REQUEST_LOG_FILE) && fs.statSync(REQUEST_LOG_FILE).size > 25 * 1024 * 1024) {
      fs.copyFileSync(REQUEST_LOG_FILE, `${REQUEST_LOG_FILE}.1`);
      fs.writeFileSync(REQUEST_LOG_FILE, "", "utf8");
    }
    fs.appendFileSync(REQUEST_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error("Request log write failed:", (error as Error).message);
  }
};

const readRequestLogs = (limit: number): RequestLogEntry[] => {
  try {
    if (!fs.existsSync(REQUEST_LOG_FILE)) return [];
    const content = fs.readFileSync(REQUEST_LOG_FILE, "utf8");
    const logs: RequestLogEntry[] = [];
    content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.min(Math.max(limit, 1), 2000))
      .reverse()
      .forEach(line => {
        try {
          logs.push(JSON.parse(line) as RequestLogEntry);
        } catch (error) {
          console.warn("Skipping malformed request log line:", (error as Error).message);
        }
      });
    return logs;
  } catch (error) {
    console.error("Request log read failed:", (error as Error).message);
    return [];
  }
};

interface ImageAnalysisTemplate {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  isDefault: boolean;
}

const defaultImageAnalysisTemplates: ImageAnalysisTemplate[] = [
  {
    id: "visual-replica",
    name: "高还原复刻",
    description: "完整提取主体、构图、光影、材质、镜头和文字布局",
    isDefault: true,
    prompt: "请把这张图片转换成一段可直接用于文生图的高还原中文提示词。依次准确描述：核心主体及外观特征、主体数量与相对位置、动作姿态、环境背景、构图与留白、拍摄视角和镜头、景深、光源方向与光质、阴影、主辅色及占比、材质纹理、画面风格、清晰度与细节、画面中可见文字及其位置。不要写分析过程，不要使用品牌猜测，不要遗漏影响复刻的视觉信息。"
  },
  {
    id: "ecommerce-product",
    name: "电商产品图",
    description: "侧重产品外观、卖点展示、背景与商业光影",
    isDefault: false,
    prompt: "请生成一段用于复刻此电商图片的中文文生图提示词。重点描述产品准确外形、材质、颜色、比例、摆放角度、卖点细节、背景场景、道具、商业布光、阴影、构图留白、广告质感、文字区域与版式。只写最终提示词，不虚构品牌或不可见参数。"
  },
  {
    id: "character-scene",
    name: "人物与场景",
    description: "侧重人物造型、姿态、镜头、氛围和叙事瞬间",
    isDefault: false,
    prompt: "请生成一段用于复刻此人物或角色场景的中文文生图提示词。准确描述人物数量、外观服饰、表情、动作姿态、人物关系、环境、道具、构图、视角、焦段感、景深、光影、色调、材质与整体艺术风格。只输出最终提示词；人物表达应自然、完整、适合大众观看。"
  }
];

const readImageAnalysisTemplates = (): ImageAnalysisTemplate[] => {
  try {
    if (!fs.existsSync(IMAGE_ANALYSIS_TEMPLATES_FILE)) {
      fs.mkdirSync(path.dirname(IMAGE_ANALYSIS_TEMPLATES_FILE), { recursive: true });
      fs.writeFileSync(IMAGE_ANALYSIS_TEMPLATES_FILE, JSON.stringify(defaultImageAnalysisTemplates, null, 2), "utf8");
      return defaultImageAnalysisTemplates;
    }
    const parsed = JSON.parse(fs.readFileSync(IMAGE_ANALYSIS_TEMPLATES_FILE, "utf8"));
    return Array.isArray(parsed) && parsed.length ? parsed : defaultImageAnalysisTemplates;
  } catch {
    return defaultImageAnalysisTemplates;
  }
};

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

interface LogPageOptions {
  page: number;
  pageSize: number;
  userId?: string;
  username?: string;
  from?: number;
  to?: number;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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

const APP_VERSION = "5.1-DB-CHECK";

// --- Database Service ---
class DatabaseService {
  private pool: pg.Pool | null = null;
  private fileData: DBData | null = null;

  constructor() {
    // Moved check to init for better visibility
  }

  async init() {
    console.log(`[${new Date().toISOString()}] === SYSTEM STARTUP (v${APP_VERSION}) ===`);
    console.log("Database connection check: DATABASE_URL is", DATABASE_URL ? "set" : "NOT set");
    
    if (DATABASE_URL) {
      console.log("PostgreSQL: Enabled. Initializing pool...");
      this.pool = new pg.Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10
      });
      
      this.pool.on('error', (err) => {
        console.error('PostgreSQL Pool Error:', err);
      });
      
      try {
        console.log("PostgreSQL: Initializing tables...");
        // Check connection with a simple query first
        await this.pool.query("SELECT 1");
        
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            credits NUMERIC(10, 2) NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS recharge_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            amount NUMERIC(10, 2) NOT NULL,
            previous_credits NUMERIC(10, 2) NOT NULL,
            new_credits NUMERIC(10, 2) NOT NULL,
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
            ["admin-1", "admin", bcrypt.hashSync(getInitialAdminPassword(), 10), "admin", 9999]
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
    let shouldSave = false;
    const dbExists = fs.existsSync(DB_FILE);
    if (!dbExists || fs.statSync(DB_FILE).size === 0) {
      console.log("Initializing new database file (missing or empty)...");
      // Ensure directory exists
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.fileData = {
        users: [
          {
            id: "admin-1",
            username: "admin",
            password: bcrypt.hashSync(getInitialAdminPassword(), 10),
            role: "admin",
            credits: 9999
          }
        ],
        rechargeLogs: [],
        generationLogs: [],
        imageHistory: []
      };
      shouldSave = true;
    } else {
      try {
        const content = fs.readFileSync(DB_FILE, "utf-8");
        this.fileData = JSON.parse(content);
        // Ensure arrays exist
        if (!this.fileData!.users) this.fileData!.users = [];
        if (!this.fileData!.rechargeLogs) this.fileData!.rechargeLogs = [];
        if (!this.fileData!.generationLogs) this.fileData!.generationLogs = [];
        if (!this.fileData!.imageHistory) this.fileData!.imageHistory = [];

        // Ensure at least one admin exists if users is empty
        if (this.fileData!.users.length === 0) {
          console.log("No users found, adding default admin...");
          this.fileData!.users.push({
            id: "admin-1",
            username: "admin",
            password: bcrypt.hashSync(getInitialAdminPassword(), 10),
            role: "admin",
            credits: 9999
          });
          shouldSave = true;
        }
      } catch (err) {
        console.error("Failed to read or parse db.json, resetting:", err);
        this.fileData = {
          users: [
            {
              id: "admin-1",
              username: "admin",
              password: bcrypt.hashSync(getInitialAdminPassword(), 10),
              role: "admin",
              credits: 9999
            }
          ],
          rechargeLogs: [],
          generationLogs: [],
          imageHistory: []
        };
        shouldSave = true;
      }
    }
    if (shouldSave) {
      this.saveFileDB();
    }
    console.log("File database initialized. User count:", this.fileData?.users.length);
  }

  private saveFileDB() {
    if (this.fileData) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.fileData, null, 2));
      } catch (err) {
        console.error("Failed to save database to file:", err);
      }
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

  async getRechargeLogs(options: LogPageOptions): Promise<PaginatedResult<RechargeLog>> {
    const { page, pageSize, userId, username, from, to } = options;
    const offset = (page - 1) * pageSize;
    if (this.pool) {
      const clauses: string[] = [];
      const filterParams: Array<string | number> = [];
      if (userId) { filterParams.push(userId); clauses.push(`user_id = $${filterParams.length}`); }
      if (username) { filterParams.push(username); clauses.push(`username = $${filterParams.length}`); }
      if (from !== undefined) { filterParams.push(from); clauses.push(`timestamp >= $${filterParams.length}`); }
      if (to !== undefined) { filterParams.push(to); clauses.push(`timestamp < $${filterParams.length}`); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const limitIndex = filterParams.length + 1;
      const offsetIndex = filterParams.length + 2;
      const [countResult, rowsResult] = await Promise.all([
        this.pool.query(`SELECT COUNT(*)::int AS total FROM recharge_logs${where}`, filterParams),
        this.pool.query(
          `SELECT id, user_id as "userId", username, amount, previous_credits as "previousCredits", new_credits as "newCredits", timestamp, admin_id as "adminId", admin_name as "adminName" FROM recharge_logs${where} ORDER BY timestamp DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
          [...filterParams, pageSize, offset]
        )
      ]);
      return { items: rowsResult.rows, total: Number(countResult.rows[0]?.total || 0), page, pageSize };
    }
    const logs = this.fileData!.rechargeLogs.filter(log =>
      (!userId || log.userId === userId) &&
      (!username || log.username === username) &&
      (from === undefined || log.timestamp >= from) &&
      (to === undefined || log.timestamp < to)
    );
    const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    return { items: sorted.slice(offset, offset + pageSize), total: sorted.length, page, pageSize };
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

  async getGenerationLogs(options: LogPageOptions): Promise<PaginatedResult<GenerationLog>> {
    const { page, pageSize, userId, username, from, to } = options;
    const offset = (page - 1) * pageSize;
    if (this.pool) {
      const clauses: string[] = [];
      const filterParams: Array<string | number> = [];
      if (userId) { filterParams.push(userId); clauses.push(`user_id = $${filterParams.length}`); }
      if (username) { filterParams.push(username); clauses.push(`username = $${filterParams.length}`); }
      if (from !== undefined) { filterParams.push(from); clauses.push(`timestamp >= $${filterParams.length}`); }
      if (to !== undefined) { filterParams.push(to); clauses.push(`timestamp < $${filterParams.length}`); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const limitIndex = filterParams.length + 1;
      const offsetIndex = filterParams.length + 2;
      const [countResult, rowsResult] = await Promise.all([
        this.pool.query(`SELECT COUNT(*)::int AS total FROM generation_logs${where}`, filterParams),
        this.pool.query(
          `SELECT id, user_id as "userId", username, timestamp FROM generation_logs${where} ORDER BY timestamp DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
          [...filterParams, pageSize, offset]
        )
      ]);
      return { items: rowsResult.rows, total: Number(countResult.rows[0]?.total || 0), page, pageSize };
    }
    const logs = this.fileData!.generationLogs.filter(log =>
      (!userId || log.userId === userId) &&
      (!username || log.username === username) &&
      (from === undefined || log.timestamp >= from) &&
      (to === undefined || log.timestamp < to)
    );
    const sorted = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    return { items: sorted.slice(offset, offset + pageSize), total: sorted.length, page, pageSize };
  }

  async getGenerationTrend(options: LogPageOptions, granularity: GenerationTrendGranularity): Promise<GenerationTrendBucket[]> {
    const { userId, username, from, to } = options;
    if (this.pool) {
      const clauses: string[] = [];
      const filterParams: Array<string | number> = [];
      if (userId) { filterParams.push(userId); clauses.push(`user_id = $${filterParams.length}`); }
      if (username) { filterParams.push(username); clauses.push(`username = $${filterParams.length}`); }
      if (from !== undefined) { filterParams.push(from); clauses.push(`timestamp >= $${filterParams.length}`); }
      if (to !== undefined) { filterParams.push(to); clauses.push(`timestamp < $${filterParams.length}`); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const bucketExpression = granularity === 'day'
        ? `to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')`
        : `to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM')`;
      const result = await this.pool.query(
        `SELECT ${bucketExpression} AS key, COUNT(*)::int AS value FROM generation_logs${where} GROUP BY 1 ORDER BY 1`,
        filterParams,
      );
      return result.rows.map(row => ({ key: String(row.key), value: Number(row.value || 0) }));
    }
    const logs = this.fileData!.generationLogs.filter(log =>
      (!userId || log.userId === userId) &&
      (!username || log.username === username) &&
      (from === undefined || log.timestamp >= from) &&
      (to === undefined || log.timestamp < to)
    );
    return aggregateGenerationTrend(logs, granularity);
  }

  async getGenerationLogsForExport(options: LogPageOptions, maxRows = 100_000) {
    const { userId, username, from, to } = options;
    if (this.pool) {
      const clauses: string[] = [];
      const filterParams: Array<string | number> = [];
      if (userId) { filterParams.push(userId); clauses.push(`user_id = $${filterParams.length}`); }
      if (username) { filterParams.push(username); clauses.push(`username = $${filterParams.length}`); }
      if (from !== undefined) { filterParams.push(from); clauses.push(`timestamp >= $${filterParams.length}`); }
      if (to !== undefined) { filterParams.push(to); clauses.push(`timestamp < $${filterParams.length}`); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const limitIndex = filterParams.length + 1;
      const [countResult, rowsResult] = await Promise.all([
        this.pool.query(`SELECT COUNT(*)::int AS total FROM generation_logs${where}`, filterParams),
        this.pool.query(
          `SELECT id, user_id as "userId", username, timestamp FROM generation_logs${where} ORDER BY timestamp DESC LIMIT $${limitIndex}`,
          [...filterParams, maxRows],
        ),
      ]);
      const total = Number(countResult.rows[0]?.total || 0);
      return { items: rowsResult.rows, total, truncated: total > maxRows };
    }
    const logs = this.fileData!.generationLogs.filter(log =>
      (!userId || log.userId === userId) &&
      (!username || log.username === username) &&
      (from === undefined || log.timestamp >= from) &&
      (to === undefined || log.timestamp < to)
    ).sort((a, b) => b.timestamp - a.timestamp);
    return { items: logs.slice(0, maxRows), total: logs.length, truncated: logs.length > maxRows };
  }

  async addImageHistory(history: ImageHistory) {
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO image_history (id, user_id, username, image_url, prompt, timestamp) VALUES ($1, $2, $3, $4, $5, $6)",
        [history.id, history.userId, history.username, history.imageUrl, history.prompt, history.timestamp]
      );
      // Cleanup old history for user in Postgres
      await this.pool.query(`
        DELETE FROM image_history 
        WHERE id IN (
          SELECT id FROM image_history 
          WHERE user_id = $1 
          ORDER BY timestamp DESC 
          OFFSET 10
        )
      `, [history.userId]);
    } else {
      this.fileData!.imageHistory.push(history);
      const userHistory = this.fileData!.imageHistory.filter(h => h.userId === history.userId);
      if (userHistory.length > 10) {
        userHistory.sort((a, b) => b.timestamp - a.timestamp);
        const toRemove = userHistory.slice(10);
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

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? allowedOrigins : true,
  credentials: true
}));
app.use((req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.originalUrl.startsWith("/api/")) return next();
  // Never log the log-reader itself. Its response contains previous entries,
  // which would recursively duplicate the entire log file on every refresh.
  if (req.originalUrl.startsWith("/api/admin/request-logs")) return next();

  const startedAt = Date.now();
  const requestId = `req-${startedAt}-${Math.random().toString(36).slice(2, 9)}`;
  let capturedResponse: unknown;
  const originalJson = res.json.bind(res);
  res.setHeader("x-banfuly-request-id", requestId);
  res.json = ((body: unknown) => {
    capturedResponse = sanitizeLogValue(body);
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", () => {
    appendRequestLog({
      id: requestId,
      timestamp: new Date(startedAt).toISOString(),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      } : undefined,
      ip: req.ip,
      requestHeaders: sanitizeLogValue({
        "content-type": req.get("content-type"),
        "user-agent": req.get("user-agent"),
        origin: req.get("origin"),
        referer: req.get("referer"),
        authorization: req.get("authorization"),
        cookie: req.get("cookie")
      }) as Record<string, unknown>,
      requestBody: sanitizeLogValue(req.body),
      responseBody: capturedResponse
    });
  });
  next();
});

// --- Database Initialization Middleware ---
// Ensure DB is initialized before handling requests
let dbInitialized = false;

app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      // If init hasn't been called yet, startServer will handle it.
      // But we add a safety check here.
      if (req.path.startsWith('/api')) {
        // Wait for a bit if it's still initializing
        let retries = 0;
        while (!dbInitialized && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
        if (!dbInitialized) {
          return res.status(503).json({ message: "数据库正在初始化，请稍后再试" });
        }
      }
    } catch {
      return res.status(500).json({ message: "数据库初始化失败" });
    }
  }
  next();
});

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

app.get("/api/admin/request-logs", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const limit = Number(req.query.limit || 500);
  const status = String(req.query.status || "").trim();
  const pathQuery = String(req.query.path || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim().toLowerCase();
  let logs = readRequestLogs(Number.isFinite(limit) ? limit : 500);
  if (status === "success") logs = logs.filter(log => log.statusCode >= 200 && log.statusCode < 400);
  if (status === "error") logs = logs.filter(log => log.statusCode >= 400);
  if (pathQuery) logs = logs.filter(log => log.path.toLowerCase().includes(pathQuery));
  if (search) logs = logs.filter(log => JSON.stringify(log).toLowerCase().includes(search));
  res.json({ logs, logFile: REQUEST_LOG_FILE, redacted: true });
});

app.get("/api/image-analysis-templates", authenticateToken, (_req: AuthRequest, res: Response) => {
  res.json(readImageAnalysisTemplates());
});

app.put("/api/admin/image-analysis-templates", authenticateToken, isAdmin, (req: AuthRequest, res: Response) => {
  const templates = req.body?.templates;
  if (!Array.isArray(templates) || templates.length < 1 || templates.length > 30) {
    return res.status(400).json({ message: "解析模板数量必须为 1–30 个" });
  }
  const normalized: ImageAnalysisTemplate[] = templates.map((item: any, index: number) => ({
    id: String(item.id || `template-${Date.now()}-${index}`).slice(0, 100),
    name: String(item.name || "").trim().slice(0, 50),
    description: String(item.description || "").trim().slice(0, 200),
    prompt: String(item.prompt || "").trim().slice(0, 10000),
    isDefault: Boolean(item.isDefault)
  }));
  if (normalized.some(item => !item.name || !item.prompt)) {
    return res.status(400).json({ message: "每个模板都必须填写名称和解析脚本" });
  }
  const defaultIndex = normalized.findIndex(item => item.isDefault);
  normalized.forEach((item, index) => { item.isDefault = index === (defaultIndex >= 0 ? defaultIndex : 0); });
  fs.mkdirSync(path.dirname(IMAGE_ANALYSIS_TEMPLATES_FILE), { recursive: true });
  fs.writeFileSync(IMAGE_ANALYSIS_TEMPLATES_FILE, JSON.stringify(normalized, null, 2), "utf8");
  res.json(normalized);
});

// --- API Routes (REGISTERED FIRST) ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dbInitialized });
});

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
  
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return res.status(400).json({ message: "Invalid credit amount" });
  }
  const roundedAmount = Math.round(amount * 10) / 10;
  if (user.credits < roundedAmount) return res.status(400).json({ message: "点数不足" });
  
  const newCredits = Math.round((user.credits - roundedAmount) * 10) / 10;
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
  const id = String(req.params.id);
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

const parseLogPage = (req: Request, userId?: string): LogPageOptions => {
  const rawPage = Number.parseInt(String(req.query.page || "1"), 10);
  const rawPageSize = Number.parseInt(String(req.query.pageSize || "20"), 10);
  return {
    page: Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1,
    pageSize: Number.isFinite(rawPageSize) ? Math.min(100, Math.max(10, rawPageSize)) : 20,
    userId: userId || (typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : undefined),
    username: typeof req.query.username === "string" && req.query.username.trim() ? req.query.username.trim() : undefined,
    from: Number.isFinite(Number(req.query.from)) ? Number(req.query.from) : undefined,
    to: Number.isFinite(Number(req.query.to)) ? Number(req.query.to) : undefined,
  };
};

app.get("/api/admin/recharge-logs", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  res.json(await db.getRechargeLogs(parseLogPage(req)));
});

app.get("/api/admin/generation-logs", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const options = parseLogPage(req);
  const granularity: GenerationTrendGranularity = req.query.granularity === 'month' ? 'month' : 'day';
  const [pageResult, trend] = await Promise.all([
    db.getGenerationLogs(options),
    db.getGenerationTrend(options, granularity),
  ]);
  res.json({ ...pageResult, trend });
});

app.get("/api/admin/generation-logs/export", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  res.json(await db.getGenerationLogsForExport(parseLogPage(req)));
});

app.post("/api/admin/users/:id/role", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  const id = String(req.params.id);
  const user = await db.findUserById(id);
  if (!user) return res.status(404).json({ message: "用户不存在" });
  
  await db.updateUserRole(id, role);
  res.json({ message: "更新成功", user: { id: user.id, username: user.username, role: role, credits: user.credits } });
});

app.post("/api/admin/users/:id/reset-password", authenticateToken, isAdmin, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
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
  res.json(await db.getRechargeLogs(parseLogPage(req, req.user?.id)));
});

app.get("/api/user/generation-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
  res.json(await db.getGenerationLogs(parseLogPage(req, req.user?.id)));
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
  const id = String(req.params.id);
  await db.deleteImageHistory(id, req.user?.id || "", req.user?.role === 'admin');
  res.json({ message: "已删除" });
});

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const extractLinkAiImage = (payload: any): string | undefined => {
  const item =
    payload?.data?.[0] ??
    payload?.images?.[0] ??
    payload?.result?.data?.[0] ??
    payload?.result?.images?.[0] ??
    payload?.output?.[0];
  return item?.url || item?.b64_json || payload?.result?.url || payload?.url;
};

interface PromptSafetyChange {
  before: string;
  after: string;
  reason: string;
}

interface PromptSafetyCompilation {
  risk_level: "low" | "medium" | "high";
  risk_reason: string[];
  original_prompt: string;
  optimized_prompt: string;
  changes: PromptSafetyChange[];
  blocked: boolean;
}

const compileGptImagePrompt = (originalPrompt: string): PromptSafetyCompilation => {
  let optimized = originalPrompt.trim();
  const reasons: string[] = [];
  const changes: PromptSafetyChange[] = [];
  let riskLevel: PromptSafetyCompilation["risk_level"] = "low";
  let blocked = false;

  const hasMinor = /(儿童|孩子|小孩|幼童|少年|少女|未成年|小学生|中学生|校服|child|kid|minor|teen(?:ager)?)/i.test(optimized);
  const hasSexualizedContent = /(性感|色情|情色|性暗示|挑逗|诱惑姿势|私密部位|裸(?:体|露)|全裸|半裸|透视|丁字裤|sex(?:ual)?|erotic|nude|naked|seductive|lingerie|bikini)/i.test(optimized);
  if (hasMinor && hasSexualizedContent) {
    reasons.push("检测到未成年人语义与性化、裸露或成人服饰语义组合");
    riskLevel = "high";
    blocked = true;
  }

  const replace = (pattern: RegExp, after: string, reason: string) => {
    const match = optimized.match(pattern);
    if (!match) return;
    const before = match[0];
    optimized = optimized.replace(pattern, after);
    changes.push({ before, after, reason });
  };

  if (!blocked) {
    const isSwimwearOrLingerie = /(比基尼|泳装|泳衣|内衣|lingerie|bikini|swimwear)/i.test(optimized);
    const hasAdultMarker = /(成年|成人|年满18|adult|over 18)/i.test(optimized);
    if (isSwimwearOrLingerie) {
      riskLevel = "medium";
      reasons.push("成人泳装或内衣商品展示需要明确成年身份和商业展示语境");
      replace(/比基尼美女/g, "成年女性时尚模特展示两件式泳装", "明确成年身份，并把模糊人物描述改为商品展示语境");
      replace(/美女穿比基尼/g, "成年女性时尚模特穿着两件式泳装", "保持泳装主题，减少性化歧义");
      replace(/比基尼/g, "两件式泳装", "使用中性的商品品类名称，保持服装款式目标不变");
      replace(/性感美女/g, "成年女性时尚模特", "去除模糊性化措辞，明确成年身份并保留女性模特主体");
      replace(/性感帅哥/g, "成年男性时尚模特", "去除模糊性化措辞，明确成年身份并保留男性模特主体");
      replace(/色情|情色|挑逗(?:性)?|诱惑姿势/g, "自然自信的时尚展示姿态", "改为非露骨的商业时尚表达");
      replace(/(?:突出|强调|聚焦)(?:胸部|臀部|私密部位|敏感部位)/g, "突出服装版型、面料和剪裁细节", "将镜头重点恢复到商品展示");
      if (!hasAdultMarker && !/(成年女性|成年男性|成年模特)/.test(optimized)) {
        const before = optimized;
        optimized = `成年时尚模特，${optimized}`;
        changes.push({ before, after: optimized, reason: "补充成年身份，避免年龄歧义" });
      }
      optimized += "\n商业电商泳装目录摄影，成年模特自然站立，采用平视全身构图，双臂自然放松，服装面料完整不透，镜头以商品版型、面料、剪裁和穿着效果为重点；不使用挑逗姿势，不使用胸部或臀部特写，不聚焦身体敏感部位。";
      changes.push({
        before: "",
        after: "商业电商服饰展示与非露骨镜头限定",
        reason: "明确合法商品展示目的，同时保持泳装或内衣主题不变"
      });
    }

    if (/(全裸|明确裸露私密部位|性行为|性交|口交|自慰|explicit sex|sexual act)/i.test(optimized)) {
      reasons.push("核心需求包含无法通过最小修正安全保留的明确裸露或性行为");
      riskLevel = "high";
      blocked = true;
    }

    if (/(血肉模糊|肢解|断肢|内脏|喷血|极度血腥|gore|dismember)/i.test(optimized)) {
      riskLevel = "medium";
      reasons.push("包含写实血腥或极端暴力细节");
      replace(/血肉模糊|肢解|断肢|内脏|喷血|极度血腥|gore|dismember/gi, "非血腥的电影化冲突效果", "保留动作或战争氛围，降低真实残酷细节");
    }

    const privacyPatterns: Array<[RegExp, string]> = [
      [/\b1[3-9]\d{9}\b/g, "[已隐藏电话号码]"],
      [/\b\d{15,18}[0-9Xx]\b/g, "[已隐藏身份证信息]"],
      [/\b(?:\d[ -]*?){13,19}\b/g, "[已隐藏银行卡信息]"]
    ];
    for (const [pattern, replacement] of privacyPatterns) {
      if (pattern.test(optimized)) {
        pattern.lastIndex = 0;
        const before = optimized;
        optimized = optimized.replace(pattern, replacement);
        changes.push({ before, after: optimized, reason: "移除可识别的敏感个人信息" });
        reasons.push("包含敏感个人信息");
        riskLevel = "medium";
      }
    }

    const hasRealPerson = /(总统|总理|国家领导人|政治人物|明星|名人|真实人物|真人|president|prime minister|celebrity)/i.test(optimized);
    const hasDeceptiveEvent = /(死亡|被捕|犯罪|丑闻|战争现场|新闻现场|真实新闻|突发新闻|dead|arrested|scandal|breaking news)/i.test(optimized);
    if (hasRealPerson && hasDeceptiveEvent) {
      riskLevel = "medium";
      reasons.push("真实人物与可能误导公众的虚假事件组合");
      optimized += "\n明确呈现为虚构电影概念设计或艺术化场景，不作为真实新闻、历史证据或现实事件记录。";
      changes.push({ before: "", after: "虚构概念设计与非新闻限定", reason: "降低真实人物虚假事件的误导风险" });
    }
  }

  return {
    risk_level: riskLevel,
    risk_reason: reasons,
    original_prompt: originalPrompt,
    optimized_prompt: optimized,
    changes,
    blocked
  };
};

app.post("/api/ai/openai/images", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { prompt, size, quality: rawQuality, images = [], mask: rawMask, apiKey: rawApiKey, requestId: rawRequestId } = req.body;
  const diagnosticId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId = normalizeImageRequestId(rawRequestId, diagnosticId);
  const requestStartedAt = Date.now();
  const apiKey = String(rawApiKey || process.env.OPENAI_API_KEY || "").trim().replace(/^Bearer\s+/i, "");
  const quality = rawQuality === "medium" || rawQuality === "high" ? rawQuality : "low";
  const outputFormat = quality === "high" ? "png" : "jpeg";
  const outputCompression = quality === "low" ? "85" : "92";
  console.log("[ImageDiagnostic]", JSON.stringify({
    diagnosticId,
    requestId,
    event: "request_started",
    provider: "openai",
    model: "gpt-image-2",
    size: String(size || "auto"),
    quality,
    outputFormat,
    referenceImageCount: Array.isArray(images) ? images.length : -1,
    hasApiKey: Boolean(apiKey)
  }));

  if (!apiKey) return res.status(400).json({ message: "请先配置 OpenAI 官方 API Key" });
  if (!prompt || typeof prompt !== "string" || prompt.length > 20000) {
    return res.status(400).json({ message: "提示词为空或过长" });
  }
  if (!Array.isArray(images) || images.length > 10) {
    return res.status(400).json({ message: "参考图格式不正确或数量超过 10 张" });
  }
  const safetyCompilation = compileGptImagePrompt(prompt);
  console.log("[ImageDiagnostic]", JSON.stringify({
    diagnosticId,
    event: "prompt_safety_compiled",
    riskLevel: safetyCompilation.risk_level,
    riskReasons: safetyCompilation.risk_reason,
    changeCount: safetyCompilation.changes.length,
    blocked: safetyCompilation.blocked
  }));
  if (safetyCompilation.blocked) {
    return res.status(400).json({
      code: "PROMPT_SAFETY_BLOCKED",
      message: "该需求包含无法在保持原目标的前提下安全修正的内容，请移除未成年人性化、明确性行为或露骨裸露描述后重试。",
      promptSafety: safetyCompilation,
      diagnosticId
    });
  }

  const requestedSize = String(size || "auto");
  const sizeMatch = requestedSize.match(/^(\d+)x(\d+)$/);
  if (requestedSize !== "auto") {
    if (!sizeMatch) return res.status(400).json({ message: "图片尺寸格式无效" });
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    const pixels = width * height;
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (width > 3840 || height > 3840 || width % 16 !== 0 || height % 16 !== 0 || ratio > 3 || pixels < 655360 || pixels > 8294400) {
      return res.status(400).json({ message: "尺寸不符合 GPT Image 2 官方限制：边长不超过 3840、必须为 16 的倍数、比例不超过 3:1，且总像素在官方范围内" });
    }
  }
  const targetSize = requestedSize;
  const headers = { "Authorization": `Bearer ${apiKey}` };
  const isEditRequest = images.length > 0;
  const promptGuidance = [
    "请准确理解并执行用户意图；如果指令较简短或存在未说明的视觉细节，请采用合理、保守且专业的商业视觉默认值补全，不要反问。",
    images.length > 0
      ? "输入图片均为视觉参考。优先保持参考图中的主体身份、产品外观、颜色、比例和关键结构，只修改用户明确要求变化的部分。"
      : "在不改变用户指定主体、构图、风格、文字和产品信息的前提下完成画面。",
    "画面应适合全年龄大众观看，角色造型完整得体、姿态自然，场景积极友好；不要自行添加无关人物、品牌、文字或可能引起误解的元素。",
    "除用户明确要求保留或生成的品牌标识与文字外，画面中不要添加任何额外水印、签名、平台角标、作者署名、二维码、应用图标或装饰性伪文字；保持成品画面干净。"
  ].join("\n");
  const editGuidance = [
    "这是对输入图片的局部编辑任务，不是重新创作或重绘整张图片。",
    "透明遮罩区域是唯一允许变化的位置；只执行用户对各编号区域明确指定的修改。",
    "遮罩外的构图、人物、商品、背景、光影、颜色、纹理、文字、图标和尺寸必须保持原图，不添加额外创意、文字、水印或装饰。"
  ].join("\n");
  // Only send the compiled prompt to the provider. Including the untouched
  // original prompt here would reintroduce the exact wording the compiler
  // removed and could cause an otherwise-corrected request to be blocked.
  const enhancedPrompt = `执行指令：\n${safetyCompilation.optimized_prompt}\n\n${isEditRequest ? `局部编辑规范：\n${editGuidance}` : `生成规范：\n${promptGuidance}`}`;
  const preparedImages: { mimeType: string; bytes: Uint8Array; extension: string; index: number }[] = [];
  for (const [index, image] of images.entries()) {
    const mimeType = String(image?.mimeType || "image/png");
    const rawData = String(image?.data || "").replace(/^data:[^;]+;base64,/, "");
    if (!rawData) return res.status(400).json({ message: `第 ${index + 1} 张参考图没有图片数据` });
    const buffer = Buffer.from(rawData, "base64");
    if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) {
      return res.status(400).json({ message: `第 ${index + 1} 张参考图无效或超过 50MB` });
    }
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
    preparedImages.push({ mimeType, bytes: new Uint8Array(buffer), extension, index });
  }
  let preparedMask: { mimeType: string; bytes: Uint8Array; extension: string } | null = null;
  if (rawMask?.data) {
    const mimeType = String(rawMask.mimeType || "image/png");
    const rawData = String(rawMask.data).replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(rawData, "base64");
    if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) return res.status(400).json({ message: "编辑遮罩无效或超过 50MB" });
    preparedMask = { mimeType, bytes: new Uint8Array(buffer), extension: mimeType.includes("webp") ? "webp" : "png" };
  }

  const dedupeKey = `${req.user?.id || "unknown"}:${requestId}`;
  const beginResult = openAiImageRequestDeduplicator.begin(dedupeKey, diagnosticId);
  if (!beginResult.accepted) {
    return res.status(409).json({
      code: beginResult.state === "running" ? "IMAGE_REQUEST_IN_PROGRESS" : "IMAGE_REQUEST_ALREADY_FINISHED",
      message: beginResult.state === "running"
        ? "同一生图任务仍在处理中，请等待原任务完成，不要重复提交"
        : "该生图任务已经处理过。为避免重复生成和重复费用，请新建任务后再试",
      requestId,
      diagnosticId: beginResult.diagnosticId,
    });
  }
  res.setHeader("X-Image-Request-Id", requestId);
  res.setHeader("X-Image-Diagnostic-Id", diagnosticId);
  const clientDisconnectController = new AbortController();
  const handleClientDisconnect = () => {
    if (!res.writableEnded && !clientDisconnectController.signal.aborted) {
      clientDisconnectController.abort(new Error("Client disconnected"));
    }
  };
  res.once("close", handleClientDisconnect);

  try {
    // One deadline and one provider attempt per user action. We deliberately do
    // not replay ambiguous network/5xx failures because the provider may have
    // already processed and billed the first request.
    const upstreamSignal = AbortSignal.any([
      AbortSignal.timeout(OPENAI_IMAGE_TOTAL_TIMEOUT_MS),
      clientDisconnectController.signal,
    ]);
    const requestOpenAiImage = async (requestPrompt: string) => {
      if (preparedImages.length > 0) {
        const form = new FormData();
        form.append("model", "gpt-image-2");
        form.append("prompt", requestPrompt);
        form.append("size", targetSize);
        form.append("quality", quality);
        form.append("moderation", "low");
        form.append("output_format", outputFormat);
        if (outputFormat !== "png") form.append("output_compression", outputCompression);
        for (const image of preparedImages) {
          form.append(
            "image[]",
            new Blob([image.bytes], { type: image.mimeType }),
            `reference-${image.index + 1}.${image.extension}`
          );
        }
        if (preparedMask) form.append("mask", new Blob([preparedMask.bytes], { type: preparedMask.mimeType }), `mask.${preparedMask.extension}`);
        return fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers,
          body: form,
          signal: upstreamSignal,
        });
      }

      return fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: requestPrompt,
          size: targetSize,
          quality,
          moderation: "low",
          output_format: outputFormat,
          ...(outputFormat !== "png" ? { output_compression: Number(outputCompression) } : {}),
          n: 1
        }),
        signal: upstreamSignal,
      });
    };

    const attempt = 1;
    const openAiResponse = await requestOpenAiImage(enhancedPrompt);
    const payload: any = await openAiResponse.json().catch(() => ({}));
    const moderationDetails = payload?.error?.moderation_details || null;

    const logProviderResponse = () => console.log("[ImageDiagnostic]", JSON.stringify({
        diagnosticId,
        event: "provider_response",
        attempt,
        endpoint: images.length > 0 ? "images/edits" : "images/generations",
        status: openAiResponse.status,
        ok: openAiResponse.ok,
        errorType: payload?.error?.type || null,
        errorCode: payload?.error?.code || null,
        providerRequestId: openAiResponse.headers.get("x-request-id"),
        moderationStage: moderationDetails?.moderation_stage || null,
        moderationCategories: moderationDetails?.categories || null
      }));
    logProviderResponse();

    if (!openAiResponse.ok) {
      if (openAiResponse.status === 429) {
        const retryAfter = openAiResponse.headers.get("retry-after");
        return res.status(429).json({
          code: "OPENAI_RATE_LIMITED",
          message: retryAfter
            ? `OpenAI 当前请求过多，请等待约 ${retryAfter} 秒后手动重试`
            : "OpenAI 当前请求过多，请稍后手动重试",
          requestId,
          diagnosticId,
          retryAfter: retryAfter || undefined,
        });
      }
      if (payload?.error?.code === "moderation_blocked") {
        const stage = moderationDetails?.moderation_stage;
        const message = stage === "input"
          ? "OpenAI 安全审核未通过：提示词或参考图可能包含敏感内容，请调整后重试。"
          : stage === "output"
            ? "本次生成结果未通过 OpenAI 安全审核，请稍微调整提示词后重新生成。"
            : "本次请求未通过 OpenAI 安全审核，请调整提示词或参考图后重试。";
        return res.status(400).json({
          code: "MODERATION_BLOCKED",
          message,
          diagnosticId,
          moderationStage: stage || "unknown",
          moderationCategories: moderationDetails?.categories || []
        });
      }
      const message = payload?.error?.message || payload?.message || openAiResponse.statusText;
      return res.status(openAiResponse.status).json({
        message: `OpenAI 生图失败：${message}`,
        requestId,
        diagnosticId
      });
    }

    const base64 = payload?.data?.[0]?.b64_json;
    if (!base64) return res.status(502).json({ message: "OpenAI 请求成功，但没有返回图片数据" });
    const mimeType = outputFormat === "png" ? "image/png" : "image/jpeg";
    return res.json({
      images: [{ url: `data:${mimeType};base64,${base64}` }],
      promptSafety: safetyCompilation,
      requestId,
      diagnosticId,
      elapsedMs: Date.now() - requestStartedAt,
      providerRequestId: openAiResponse.headers.get("x-request-id"),
    });
  } catch (err: unknown) {
    const error = err as Error & { cause?: { message?: string; code?: string } };
    console.error("[ImageDiagnostic]", JSON.stringify({
      diagnosticId,
      event: "network_error",
      message: error.message,
      cause: error.cause?.message || null,
      code: error.cause?.code || null
    }));
    if (clientDisconnectController.signal.aborted || res.destroyed) return;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ code: 'UPSTREAM_TIMEOUT', message: "OpenAI 图像服务超过 3 分 30 秒仍未完成，本次不会自动重复生成，请稍后手动重试", requestId, diagnosticId });
    }
    return res.status(502).json({ code: "OPENAI_NETWORK_ERROR", message: "无法连接 OpenAI 官方图像服务，本次不会自动重复生成，请手动重试", requestId, diagnosticId, error: error.message });
  } finally {
    res.off("close", handleClientDisconnect);
    openAiImageRequestDeduplicator.finish(dedupeKey);
  }
});

app.post("/api/ai/linkai/generate", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { prompt, size, apiKey: rawApiKey, baseUrl: rawBaseUrl, model: rawModel } = req.body;
  const apiKey = String(rawApiKey || process.env.LINKAI_API_KEY || "").trim().replace(/^Bearer\s+/i, "");
  const model = String(rawModel || process.env.LINKAI_MODEL_ID || "gpt-image-2").trim();
  const baseUrl = String(rawBaseUrl || process.env.LINKAI_BASE_URL || "https://api.linkai.shop").trim().replace(/\/+$/, "");

  if (!apiKey) return res.status(400).json({ message: "请先配置 LinkAI API Key" });
  if (!prompt || typeof prompt !== "string" || prompt.length > 20000) {
    return res.status(400).json({ message: "提示词为空或过长" });
  }
  if (model !== "gpt-image-2") {
    return res.status(400).json({ message: "当前仅允许 gpt-image-2 模型" });
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return res.status(400).json({ message: "LinkAI 地址格式无效" });
  }
  if (parsedBaseUrl.protocol !== "https:" || parsedBaseUrl.hostname !== "api.linkai.shop") {
    return res.status(400).json({ message: "当前仅允许 https://api.linkai.shop" });
  }

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  try {
    const submitResponse = await fetch(`${baseUrl}/v1/images/generations/async`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt, size: size || "1024x1024" })
    });
    const submitPayload: any = await submitResponse.json().catch(() => ({}));
    if (!submitResponse.ok) {
      const message = submitPayload?.error?.message || submitPayload?.message || submitResponse.statusText;
      return res.status(submitResponse.status).json({ message: `LinkAI 创建任务失败：${message}` });
    }

    const taskId = submitPayload?.task_id;
    if (!taskId) return res.status(502).json({ message: "LinkAI 未返回 task_id" });

    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await sleep(3000);
      const taskResponse = await fetch(`${baseUrl}/v1/images/tasks/${encodeURIComponent(taskId)}`, { headers });
      const taskPayload: any = await taskResponse.json().catch(() => ({}));
      if (!taskResponse.ok) {
        const message = taskPayload?.error?.message || taskPayload?.message || taskResponse.statusText;
        return res.status(taskResponse.status).json({ message: `LinkAI 查询任务失败：${message}` });
      }

      const status = String(taskPayload?.status || "").toLowerCase();
      if (status === "failed") {
        const message = taskPayload?.error?.message || taskPayload?.message || "生成任务失败";
        return res.status(502).json({ message: `LinkAI 生成失败：${message}` });
      }
      if (status === "completed" || status === "succeeded" || status === "success") {
        const image = extractLinkAiImage(taskPayload);
        if (!image) return res.status(502).json({ message: "LinkAI 任务已完成，但未找到图片数据" });
        return res.json({ images: [{ url: image }] });
      }
    }

    return res.status(504).json({ message: "LinkAI 生成超时，请稍后重试" });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("LinkAI request failed:", error.message);
    return res.status(502).json({ message: "LinkAI 服务请求失败", error: error.message });
  }
});

app.post("/api/doubao/generate", authenticateToken, async (req: AuthRequest, res: Response) => {
  return res.status(410).json({ message: "This provider has been removed" });
  /*
  const { prompt, model, size, n, apiKey: rawApiKey, endpoint: rawEndpoint } = req.body;
  
  if (!rawApiKey || !model) {
    return res.status(400).json({ message: "API Key 或 Model ID 缺失" });
  }

  const apiKey = String(rawApiKey).trim().replace(/^Bearer\s+/i, '');
  const endpoint = rawEndpoint ? String(rawEndpoint).trim() : null;

  try {
    let targetUrl = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
    if (endpoint && typeof endpoint === 'string' && endpoint.startsWith('http')) {
      targetUrl = endpoint;
    }

    // Auto-fix for common path naming issues in Doubao/OpenAI proxies
    if (targetUrl.includes('ark.cn-beijing.volces.com') && !targetUrl.endsWith('/images/generations')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/images/generations';
    } else if (!targetUrl.endsWith('/generations') && !targetUrl.includes('/v1/chat/')) {
       // Only trying to fix if it looks like a base URL
       if (targetUrl.split('/').length < 5) {
         console.log(`[Proxy] Normalizing Doubao endpoint: ${targetUrl}`);
       }
    }
    
    const isApiyiResponses = targetUrl.toLowerCase().includes('apiyi.com') && targetUrl.toLowerCase().includes('/v1/responses');
    
    // Use the model ID provided by the user directly.
    const targetModel = model;
    
    let body: Record<string, unknown>;
    if (isApiyiResponses) {
      // OpenAI Style
      let openAiSize = '1024x1024';
      if (size.includes('x')) {
        const [w, h] = size.split('x').map(Number);
        if (w > h) openAiSize = '1792x1024';
        else if (h > w) openAiSize = '1024x1792';
        else openAiSize = '1024x1024';
      }
      
      body = {
        model: targetModel,
        prompt,
        n: n || 1,
        size: openAiSize
      };
    } else {
      // Ark (Doubao) Style / Default
      body = {
        model: targetModel,
        prompt,
        size,
        n: n || 1,
        watermark: false
      };
    }
    
    console.log(`[Proxy] Sending request to ${targetUrl}, isApiyiResponses: ${isApiyiResponses}`);
    console.log(`[Proxy] Body:`, JSON.stringify({ 
      ...body, 
      prompt: body.prompt ? (body.prompt.length > 50 ? body.prompt.substring(0, 50) + '...' : body.prompt) : undefined,
    }));
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText || response.statusText } };
      }
      const message = errorData.error?.message || errorData.message || response.statusText;
      let uiMessage = `API 生成失败 (${targetUrl}): ${message}`;
      if (response.status === 404) {
        uiMessage += "\n提示：路径可能不正确。若使用第三方转发，请尝试改为 /v1/images/generations 结尾。";
      }
      
      console.error(`API Proxy Error [${targetUrl}]:`, message, errorData);
      return res.status(response.status).json({ 
        message: uiMessage,
        details: errorData,
        targetUrl
      });
    }

    const result = await response.json();
    
    // Normalize response for Client
    if (result.choices) {
      // Parse chat response to find image URL (fallback for some providers)
      let imageUrl = "";
      const content = (result.choices?.[0]?.message?.content as string) || "";
      
      const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
      const urlMatch = content.match(/https?:\/\/[^\s"'\)]+/);
      imageUrl = mdMatch ? mdMatch[1] : (urlMatch ? urlMatch[0] : "");

      if (!imageUrl && result.choices?.[0]?.message?.image_url) {
        imageUrl = result.choices[0].message.image_url;
      }

      if (!imageUrl && typeof content === 'string' && content.trim().startsWith('http')) {
        imageUrl = content.trim();
      }

      if (!imageUrl) {
        return res.status(500).json({ 
          message: "解析失败: 未在模型返回的内容中发现有效的图片地址",
          details: { content }
        });
      }

      res.json({
        images: [{ url: imageUrl }]
      });
    } else if (isApiyiResponses || result.data) {
      // OpenAI response format mapping
      res.json({
        images: result.data.map((item: Record<string, unknown>) => ({ url: item.url || item.b64_json }))
      });
    } else {
      res.json(result);
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Proxy Error:", error);
    res.status(500).json({ message: "代理请求失败", error: error.message });
  }
  */
});

app.post("/api/user/history/bulk-delete", authenticateToken, async (req: AuthRequest, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ message: "无效的 ID 列表" });
  
  for (const id of ids) {
    await db.deleteImageHistory(id, req.user?.id || "", req.user?.role === 'admin');
  }
  res.json({ message: "批量删除成功" });
});

// --- Vite Integration ---
async function startServer() {
  // 1. Initialize Database
  try {
    await db.init();
    dbInitialized = true;
  } catch (err) {
    console.error("Critical: Database initialization failed:", err);
    dbInitialized = true; // Fallback to file DB is handled inside init()
  }

  // 2. Static files or Vite middleware (AFTER API routes)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configLoader: "runner",
      cacheDir: ".vite-runtime-cache",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    } else {
      console.warn("Warning: dist folder not found. Static files will not be served.");
    }
  }

  // Fallback for unmatched API routes to prevent them from returning HTML
  app.use("/api", (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // SPA Fallback - MUST BE LAST
  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.get("*all", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      app.get("*all", (req, res) => {
        res.status(200).send(`
          <html>
            <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
              <h1>BANFULY-详情助手 服务器已启动</h1>
              <p>前端静态文件 (dist) 尚未生成或未找到。</p>
              <p>请确保已运行 <code>npm run build</code>。</p>
              <hr/>
              <p style="color: #666;">Node Environment: ${process.env.NODE_ENV}</p>
            </body>
          </html>
        `);
      });
    }
  } else {
    // In dev mode, Vite handles SPA fallback via middleware
  }

  const PORT = process.env.PORT || 3000;

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
