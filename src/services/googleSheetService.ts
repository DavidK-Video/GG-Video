// ============================================================
//  services/googleSheetService.ts — V4.0 ROBUST
// ============================================================

const SHEET_API_URL = (import.meta.env.VITE_SHEET_API_URL ||
  "https://script.google.com/macros/s/AKfycbzMK8b6L4xtbcT-9UtkM2a1g3VqBsNdon6aHGer1fe4VFgb227IQR01lGkG8PTZKh0U/exec").trim();

const SECRET_TOKEN = (import.meta.env.VITE_SECRET_TOKEN || "YOHU_SECRET_2026").trim();

export interface SheetUser {
  userId       : string;
  email        : string;
  phone        : string;
  fullName     : string;
  plan         : string;
  userStatus   : string;
  active       : boolean;
  credits      : number;
  expiry       : string;
  pro1_enabled : boolean;
  pro9_enabled : boolean;
  role         : string;
  api_keys     : string[];
  project_name : string;
  created_at   : string;
  videoCount   : number;
  imageCount   : number;
  voiceCount   : number;
  lastActive   : string;
  isSuspended  : boolean;
  error?       : string;
  notFound?     : boolean;
  notFoundCode? : number;
}

export type ActionType = "VIDEO" | "IMAGE" | "VOICE" | "TEXT";

// ── Gọi API ──────────────────────────────────────────────────
async function callSheet(body: Record<string, any>): Promise<any> {
  const action = String(body.action || "").trim();
  const payload = { ...body, token: SECRET_TOKEN, action };

  const processResult = (data: any) => {
    if (!data.success) {
      const errorMsg = String(data.error || "").toLowerCase();
      const isNotFound = errorMsg.includes("not found") || errorMsg.includes("không tìm thấy");
      const isExisting = errorMsg.includes("đã tồn tại") || errorMsg.includes("updated");
      if (!isNotFound && !isExisting) console.warn(`[Sheet] ${action} API returned success=false:`, data.error);
      if (isExisting) return { success: true, message: "Updated" };
      return { ...data, isNotFound };
    }
    return data;
  };

  try {
    // 1. Thử POST (Tiêu chuẩn)
    const res = await fetch(SHEET_API_URL, {
      method  : "POST",
      headers : { "Content-Type": "text/plain" },
      body    : JSON.stringify(payload),
      redirect: "follow",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success || !String(data.error || "").toLowerCase().includes("unknown")) {
        return processResult(data);
      }
    }
  } catch {
    console.warn(`[Sheet] POST ${action} failed, trying GET fallback...`);
  }

  // 2. GET Fallback (Dùng khi POST bị lỗi body hoặc redirect)
  try {
    const q = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => {
      q.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    const res = await fetch(`${SHEET_API_URL}?${q.toString()}`, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return processResult(await res.json());
  } catch (err) {
    console.error(`[Sheet] ${action} total network error:`, err);
    return { success: false, error: "Lỗi kết nối server Google", isNetworkError: true };
  }
}

// ── Parse user — cực kỳ linh hoạt để tránh lỗi property name ──────
function parseUser(d: any): SheetUser {
  if (!d) return { email: "" } as SheetUser;
  
  // LOG CHI TIẾT: Bạn nhấn F12 -> Console để xem hệ thống đọc được gì từ Sheet
  console.log("[Sheet] === DỮ LIỆU THÔ TỪ GOOGLE SCRIPT ===", d);

  const getVal = (keys: string[], indexSet: number[], def: any) => {
    // 1. Thử tìm theo Key (Object)
    if (typeof d === 'object' && !Array.isArray(d)) {
      for (const key of keys) {
        const k = key.toLowerCase();
        const foundKey = Object.keys(d).find(ek => ek.toLowerCase() === k);
        if (foundKey !== undefined && d[foundKey] !== null && d[foundKey] !== undefined) return d[foundKey];
      }
    }
    // 2. Thử theo Index (Array - Thường gặp khi Script trả về sheet.getValues())
    if (Array.isArray(d)) {
      for (const idx of indexSet) {
        if (idx < d.length && d[idx] !== undefined && d[idx] !== null) {
          if (typeof d[idx] === 'string' && d[idx].trim() === "" && def !== "") continue;
          return d[idx];
        }
      }
    }
    return def;
  };

  // EMAIL: Cột B (1) hoặc A (0)
  const email = String(getVal(["email", "Email"], [1, 0], "")).trim().toLowerCase();
  
  // GÓI: Cột E (4) - TRẠNG THÁI: Cột F (5)
  const rawPlan = String(getVal(["plan", "gói"], [4, 3], "FREE")).trim().toUpperCase();
  const status  = String(getVal(["userStatus", "trạng thái", "status"], [5, 4], "ACTIVE")).trim().toUpperCase();
  
  const isSystemAdmin = email === "yohu.vn@gmail.com";
  // Nếu là admin gốc nhưng gói trống, ép lên PRO9
  const planFinal = (isSystemAdmin && (rawPlan === "FREE" || !rawPlan)) ? "PRO9" : rawPlan;
  
  // Normalize plan mapping
  const isPro9Plan = planFinal === "PRO9" || planFinal.includes("GÓI CHUYÊN NGHIỆP 9") || planFinal.includes("PROFESSIONAL 9") || planFinal.includes("VIP");
  const isPro1Plan = planFinal === "PRO1" || planFinal.includes("GÓI CHUYÊN NGHIỆP 1") || planFinal.includes("PROFESSIONAL 1");
  
  const isAdmin = isPro9Plan || isSystemAdmin;

  // CREDITS CÒN: Cột G (6)
  const defaultCredits = isSystemAdmin ? 999 : 0;
  const rawCredits = getVal(["credits", "credits còn", "credits_con"], [6, 5], defaultCredits);
  
  let credits: number;
  if (typeof rawCredits === 'number') {
    credits = rawCredits;
  } else if (typeof rawCredits === 'string') {
    credits = Number(rawCredits.replace(/[.,\s]/g, '')) || 0;
  } else {
    credits = Number(rawCredits) || 0;
  }

  const user: SheetUser = {
    userId       : String(getVal(["userId", "id"], [0], "")), 
    email        : email,
    phone        : String(getVal(["phone", "số điện thoại", "phone_number"], [2, 1], "")),
    fullName     : String(getVal(["fullName", "họ tên", "name"], [3, 2], "")),
    plan         : planFinal,
    userStatus   : status,
    active       : status === "ACTIVE" || isAdmin,
    isSuspended  : status === "SUSPENDED",
    credits      : credits,
    expiry       : String(getVal(["expiry", "hết hạn", "expiry_date"], [9, 8], "")),
    pro1_enabled : isAdmin || isPro1Plan || isPro9Plan,
    pro9_enabled : isAdmin || isPro9Plan,
    role         : isAdmin ? "admin" : (isPro1Plan ? "pro1" : "user"),
    api_keys     : Array.isArray(getVal(["api_keys", "api key (pro1)"], [10, 9], [])) ? getVal(["api_keys", "api key (pro1)"], [10, 9], []) : [],
    project_name : String(getVal(["project_name", "ghi chú admin"], [15, 14], "")),
    created_at   : String(getVal(["created_at", "ngày đăng ký"], [8, 7], "")),
    videoCount   : Number(getVal(["videoCount", "số video đã tạo"], [11, 10], 0)),
    imageCount   : Number(getVal(["imageCount", "số ảnh đã tạo"], [12, 11], 0)),
    voiceCount   : Number(getVal(["voiceCount", "số voice đã tạo"], [13, 12], 0)),
    lastActive   : String(getVal(["lastActive", "hoạt động cuối"], [14, 13], "")),
  };

  console.log(`[Sheet] ✅ ĐỒNG BỘ THÀNH CÔNG: ${email}, Gói: ${user.plan}, Credits: ${user.credits}`);
  return user;
}

// ============================================================
export const googleSheetService = {

  getUser: async (email: string): Promise<SheetUser | null> => {
    const res = await callSheet({ action: "getUser", email: email.trim() });
    console.log("[Sheet] getUser raw res:", JSON.stringify(res));
    
    if (res.success && (res.data || res.user)) {
      const d = res.data || res.user;
      
      // Use the robust parseUser logic
      const user = parseUser(d);
      
      // Ensure we have correct email if the one from sheet is empty but we requested a specific one
      if (!user.email && email) user.email = email.trim().toLowerCase();
      
      // Extra robust check for API Keys specifically in getUser context
      const rawApiKeys = d.api_keys || d.apiKeyOwn || d["api key (pro1)"] || d["API Key"] || d.apiKey || [];
      const parsedApiKeys = Array.isArray(rawApiKeys) 
        ? rawApiKeys 
        : (typeof rawApiKeys === 'string' && rawApiKeys.trim().length > 0
            ? rawApiKeys.split(/[,;\n\s]+/).map((s: any) => String(s).trim()).filter(Boolean) 
            : (d.apiKeyOwn ? [d.apiKeyOwn] : []));
            
      if (parsedApiKeys.length > 0 && (!user.api_keys || user.api_keys.length === 0)) {
        user.api_keys = parsedApiKeys;
      }

      console.log(`[Sheet] ✅ ${user.email} | Gói: ${user.plan} | Credits: ${user.credits} | Keys: ${user.api_keys.length}`);
      return user;
    }
    
    if (res.isNotFound) {
      return { email: "", notFound: true } as any;
    }
    return null;
  },

  fetchUser: async (email: string) => googleSheetService.getUser(email),

  upsertUser: async (params: { email: string; phone?: string; fullName?: string; machineId?: string; project_name?: string; ref_by?: string }) => {
    const res = await callSheet({ action: "registerUser", ...params });
    return res;
  },

  deductCredit: async (email: string, amount: number, activity: ActionType = "VIDEO") => {
    return callSheet({ action: "deductCredit", email: email.trim(), amount, activity });
  },

  deductCredits: async (email: string, amount: number, activity: ActionType = "VIDEO") =>
    googleSheetService.deductCredit(email, amount, activity),

  getAllApiKeys: async () => {
    const res = await callSheet({ action: "getAllApiKeys" });
    return res.success
      ? { keys: res.data || [], paidKeys: res.paidKeys || [], freeKeys: res.freeKeys || [] }
      : { keys: [], paidKeys: [], freeKeys: [] };
  },

  getAdminKeys: async () => googleSheetService.getAllApiKeys(),

  checkCredits: async (email: string, action: ActionType) => {
    const user = await googleSheetService.getUser(email);
    if (!user || user.notFound) return { ok: false, error: "Tài khoản chưa kích hoạt", credits: 0, need: 0 };
    const costs: Record<ActionType, number> = { VIDEO: 3, VOICE: 1, IMAGE: 2, TEXT: 1 };
    const need = costs[action] || 1;
    if (user.userStatus === "SUSPENDED") return { ok: false, error: "Tài khoản bị khóa", credits: user.credits, need };
    if (user.credits < need) return { ok: false, error: `Cần ${need} credit, còn ${user.credits}`, credits: user.credits, need };
    return { ok: true, credits: user.credits, need };
  },

  activateUser: async (email: string, days: number, plan: string, phone: string = "") =>
    callSheet({ action: "activateUser", email: email.trim(), days, plan, phone: phone.trim() }),
  activateAffiliate: async (email: string, days: number, plan: string, phone: string, refBy: string) =>
    callSheet({ 
      action: "activateAffiliate", 
      email: email.trim(), 
      days: Number(days), 
      plan: plan.toUpperCase(), 
      phone: phone.trim(), 
      ref_by: refBy.trim() 
    }),

  togglePro: async (email: string, field: string, value: boolean, plan: string) =>
    callSheet({ action: "togglePro", email: email.trim(), field, value, plan }),

  toggleActive: async (email: string, value: boolean, plan: string) =>
    callSheet({ action: "toggleActive", email: email.trim(), value, plan }),

  updateConfig: async (email: string, projectName: string, apiKeys: string[]) =>
    callSheet({ action: "updateConfig", email: email.trim(), project_name: projectName, api_keys: apiKeys }),

  getConfig: async () => {
    const res = await callSheet({ action: "getConfig" });
    return res.success ? res.config : null;
  },

  pingSheet: async (): Promise<boolean> => {
    const res = await callSheet({ action: "ping" });
    return res.success === true;
  },
};

export const {
  getUser, fetchUser, upsertUser, deductCredit, deductCredits,
  getAllApiKeys, getAdminKeys, getConfig, checkCredits,
  pingSheet, updateConfig, activateAffiliate
} = googleSheetService;
