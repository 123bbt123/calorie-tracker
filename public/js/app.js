/* ============================================================
   日食迹 · 热量管理工作台 - 主应用逻辑
   ============================================================ */

// ============================
// 配置
// ============================
const SUPABASE_URL = 'https://xbcucfsmcnorausaafwg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiY3VjZnNtY25vcmF1c2FhZndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NzUwNzMsImV4cCI6MjEwMTA1MTA3M30.yfGnYImtTpWCFYLL-rUSlR7g-uQDVKOYM7ZFKYk9CfE';

const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐', icon: '🌅' },
  { key: 'lunch', label: '午餐', icon: '☀️' },
  { key: 'dinner', label: '晚餐', icon: '🌙' },
  { key: 'afternoon_tea', label: '下午茶', icon: '☕' },
  { key: 'late_night', label: '夜宵', icon: '🍢' },
  { key: 'other', label: '其他', icon: '🍴' },
];

const AI_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-flash' },
};

// ============================
// 状态
// ============================
let state = {
  currentDate: new Date(),
  currentTab: 'estimate',
  meals: [],
  estimationResult: null,
  currentImageBase64: null,
  // 用户档案：currentProfileId 是数据隔离 key，roomCode 等于它
  currentProfileId: localStorage.getItem('currentProfileId') || null,
  profiles: JSON.parse(localStorage.getItem('profiles') || '[]'),
  roomCode: localStorage.getItem('currentProfileId') || localStorage.getItem('roomCode') || 'default',
  aiConfig: JSON.parse(localStorage.getItem('aiConfig') || '{}'),
  aiConfigVision: JSON.parse(localStorage.getItem('aiConfigVision') || '{}'),
  supabaseReady: false,
  editingMealId: null,
  currentReportType: 'daily',
};

let supabaseClient = null;

// ============================
// Supabase 初始化
// ============================
function initSupabase() {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    console.warn('Supabase init failed:', e);
  }
}

async function checkSupabaseTables() {
  if (!supabaseClient) return false;
  try {
    const { data, error } = await supabaseClient
      .from('meals')
      .select('id')
      .limit(1);
    if (error && error.code === 'PGRST205') return false;
    return !error;
  } catch {
    return false;
  }
}

// ============================
// 数据操作 - 云端
// ============================
async function loadMealsFromCloud(dateStr) {
  if (!supabaseClient || !state.supabaseReady) return [];
  try {
    const { data, error } = await supabaseClient
      .from('meals')
      .select('*')
      .eq('room_code', state.roomCode)
      .eq('record_date', dateStr)
      .order('record_time', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Load from cloud failed:', e);
    return [];
  }
}

async function saveMealToCloud(meal) {
  if (!supabaseClient || !state.supabaseReady) return null;
  try {
    const { data, error } = await supabaseClient
      .from('meals')
      .insert(meal)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('Save to cloud failed:', e);
    return null;
  }
}

async function updateMealInCloud(id, updates) {
  if (!supabaseClient || !state.supabaseReady) return false;
  try {
    const { error } = await supabaseClient
      .from('meals')
      .update(updates)
      .eq('id', id);
    return !error;
  } catch (e) {
    console.warn('Update in cloud failed:', e);
    return false;
  }
}

async function deleteMealFromCloud(id) {
  if (!supabaseClient || !state.supabaseReady) return false;
  try {
    const { error } = await supabaseClient
      .from('meals')
      .delete()
      .eq('id', id);
    return !error;
  } catch (e) {
    console.warn('Delete from cloud failed:', e);
    return false;
  }
}

async function loadMealsRangeFromCloud(startDate, endDate) {
  if (!supabaseClient || !state.supabaseReady) return [];
  try {
    const { data, error } = await supabaseClient
      .from('meals')
      .select('*')
      .eq('room_code', state.roomCode)
      .gte('record_date', startDate)
      .lte('record_date', endDate)
      .order('record_date', { ascending: true })
      .order('record_time', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Load range from cloud failed:', e);
    return [];
  }
}

// ============================
// 用户档案 - 云端同步
// ============================
async function syncProfileToCloud(profile) {
  if (!supabaseClient || !state.supabaseReady) return;
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .upsert({
        id: profile.id,
        name: profile.name,
        avatar: profile.avatar,
        created_at: profile.createdAt,
        birthday: profile.birthday || null,
        gender: profile.gender || null,
        height: profile.height || null,
        weight: profile.weight || null,
        daily_burn: profile.dailyBurn || null,
      });
    if (error) console.warn('Sync profile to cloud failed:', error);
  } catch (e) {
    console.warn('Sync profile to cloud failed:', e);
  }
}

async function deleteProfileFromCloud(profileId) {
  if (!supabaseClient || !state.supabaseReady) return;
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .delete()
      .eq('id', profileId);
    if (error) console.warn('Delete profile from cloud failed:', error);
  } catch (e) {
    console.warn('Delete profile from cloud failed:', e);
  }
}

async function loadProfilesFromCloud() {
  if (!supabaseClient || !state.supabaseReady) return [];
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      createdAt: p.created_at,
      birthday: p.birthday || null,
      gender: p.gender || null,
      height: p.height || null,
      weight: p.weight || null,
      dailyBurn: p.daily_burn || null,
    }));
  } catch (e) {
    console.warn('Load profiles from cloud failed:', e);
    return [];
  }
}

// ============================
// 数据操作 - 本地
// ============================
function getLocalMeals(dateStr) {
  const key = `meals_${state.roomCode}_${dateStr}`;
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function saveLocalMeals(dateStr, meals) {
  const key = `meals_${state.roomCode}_${dateStr}`;
  localStorage.setItem(key, JSON.stringify(meals));
}

function generateLocalId() {
  return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// ============================
// 数据加载（合并云端和本地）
// ============================
async function loadMeals(date) {
  const dateStr = formatDate(date);
  const cloudMeals = await loadMealsFromCloud(dateStr);
  const localMeals = getLocalMeals(dateStr);

  // 合并：优先使用云端数据，本地数据补充
  if (cloudMeals.length > 0) {
    state.meals = cloudMeals;
    // 同步到本地
    saveLocalMeals(dateStr, cloudMeals);
  } else {
    state.meals = localMeals;
  }
  return state.meals;
}

// ============================
// AI 集成
// ============================
function getAIConfig() {
  return {
    baseUrl: state.aiConfig.baseUrl || AI_PRESETS.deepseek.baseUrl,
    apiKey: state.aiConfig.apiKey || '',
    model: state.aiConfig.model || AI_PRESETS.deepseek.model,
  };
}

function getVisionAIConfig() {
  return {
    baseUrl: state.aiConfigVision.baseUrl || AI_PRESETS.zhipu.baseUrl,
    apiKey: state.aiConfigVision.apiKey || '',
    model: state.aiConfigVision.model || AI_PRESETS.zhipu.model,
  };
}

function hasVisionConfig() {
  return !!getVisionAIConfig().apiKey;
}

function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('请求超时，请检查网络或稍后再试'));
    }, timeoutMs);

    fetch(url, { ...options, signal: controller.signal })
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

async function callAI(messages, options = {}, configOverride = null) {
  const config = configOverride || getAIConfig();
  if (!config.apiKey) {
    throw new Error('请先在设置中配置 AI API Key');
  }

  const targetUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: config.model,
    messages: messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
  };

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  };

  // 先尝试本地代理（本地开发 / 自托管）
  try {
    const proxyResponse = await fetchWithTimeout('/api/ai-proxy', {
      ...requestOptions,
      body: JSON.stringify({
        targetUrl,
        apiKey: config.apiKey,
        body: body,
      }),
    }, 90000);
    const contentType = proxyResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json') || proxyResponse.status >= 400) {
      return await parseAIResponse(proxyResponse);
    }
    // 代理返回了 HTML（通常是 404），继续尝试直接请求
  } catch (e) {
    if (e.message.includes('超时')) throw e;
    // 代理不可用，继续尝试直接请求
  }

  // 直接请求 AI API（部署到静态站点时使用）
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const directResponse = await fetchWithTimeout(targetUrl, requestOptions, 90000);
      return await parseAIResponse(directResponse);
    } catch (e) {
      lastError = e;
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        throw new Error('当前环境无法直接调用 AI API（可能是 CORS 限制），建议本地运行或使用支持浏览器调用的 AI 服务（如硅基流动/豆包/通义千问）');
      }
      // 第一次失败时重试一次（可能是网络瞬断或模型忙）
      if (attempt === 0) {
        console.warn('AI 请求失败，正在重试:', e.message);
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error('AI 请求失败，请重试');
}

async function parseAIResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!response.ok) {
    let errMsg = `API 错误 (${response.status})`;
    if (response.status === 401) {
      errMsg = 'API Key 无效或已过期（401），请检查是否复制完整，或到智谱控制台重新生成';
    } else if (contentType.includes('application/json') && text.trim()) {
      try {
        const errData = JSON.parse(text);
        errMsg = errData.error?.message || errData.message || errMsg;
      } catch {}
    } else if (text.trim()) {
      // 可能是网关返回的 HTML 错误页
      const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const snippet = (titleMatch?.[1] || bodyMatch?.[1] || text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (snippet) {
        errMsg = `${errMsg}: ${snippet}`;
      } else {
        errMsg = `${errMsg}（服务器返回了 HTML 错误页，可能是请求被拦截）`;
      }
    } else {
      errMsg = `${errMsg}（服务器返回空响应）`;
    }
    throw new Error(errMsg);
  }

  if (!text || !text.trim()) {
    throw new Error('AI 返回了空响应，请重试或换一张更清晰的图片');
  }

  // 如果成功响应却是 HTML（正常情况下不应发生）
  if (contentType.includes('text/html') || text.trim().startsWith('<')) {
    const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(`AI 返回了 HTML 页面：${snippet || '请求可能被拦截'}`);
  }

  try {
    const data = JSON.parse(text);
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    throw new Error('AI 返回格式异常，请重试');
  }
}

function parseAIJSON(text) {
  // 清理 markdown 代码块标记
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  // 尝试提取 JSON
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // JSON 解析失败，尝试从自然语言中提取
    return parseNaturalLanguageToJSON(text);
  }
}

function parseNaturalLanguageToJSON(text) {
  // 尝试从中文自然语言中提取关键信息
  const result = {
    foods: [],
    total_calories: 0,
    calorie_range_min: null,
    calorie_range_max: null,
    confidence: '中',
    error_sources: 'AI 未按 JSON 格式返回，已从文本中解析'
  };

  // 提取食物名称和热量
  // 匹配：食物名称：xxx 或 名称：xxx 或 - xxx
  const foodMatches = text.match(/(?:食物名称|名称|食物)[：:]\s*([^\n，。]+)(?:[，,]\s*.*?)?(?:约?\s*(\d+)\s*kcal)?/gi) ||
                      text.match(/[-*]\s*([^\n：:]+)(?:[：:]\s*)?(?:约?\s*(\d+)\s*kcal)?/gi);

  if (foodMatches && foodMatches.length > 0) {
    foodMatches.forEach(line => {
      const nameMatch = line.match(/(?:食物名称|名称|食物)[：:]\s*([^\n，。]+)/i) ||
                        line.match(/[-*]\s*([^\n：:]+?)(?:[：:]\s*|\s+约|\s+\d+kcal|$)/i);
      const calMatch = line.match(/(\d+)\s*kcal/i) || text.match(/总热量[：:]\s*(\d+)\s*kcal/i);
      const name = nameMatch ? nameMatch[1].trim().replace(/[，,。]/g, '') : '未知食物';
      const calories = calMatch ? parseInt(calMatch[1]) : 0;
      if (name && name !== '未知食物') {
        result.foods.push({ name, portion: '', calories });
      }
    });
  }

  // 提取总热量
  const totalMatch = text.match(/总热量[：:]\s*(\d+)\s*kcal/i) ||
                     text.match(/(?:一共|总计|约)\s*(\d+)\s*kcal/i) ||
                     text.match(/(\d+)\s*kcal/);
  if (totalMatch) {
    result.total_calories = parseInt(totalMatch[1]);
  }

  // 提取热量范围
  const rangeMatch = text.match(/(\d+)\s*[-~]\s*(\d+)\s*kcal/i);
  if (rangeMatch) {
    result.calorie_range_min = parseInt(rangeMatch[1]);
    result.calorie_range_max = parseInt(rangeMatch[2]);
  }

  // 提取可信度
  if (/可信度[：:]\s*高/i.test(text) || /置信度[：:]\s*高/i.test(text)) result.confidence = '高';
  else if (/可信度[：:]\s*低/i.test(text) || /置信度[：:]\s*低/i.test(text)) result.confidence = '低';

  // 如果什么都没提取到，说明真的无法解析
  if (result.foods.length === 0 && result.total_calories === 0) {
    throw new Error('AI 返回格式无法识别，请重试或更换模型');
  }

  // 如果没提取到总热量，用食物热量之和
  if (result.total_calories === 0 && result.foods.length > 0) {
    result.total_calories = result.foods.reduce((s, f) => s + (f.calories || 0), 0);
  }

  return result;
}

// ============================
// AI - 热量估算
// ============================
// 通用：判断当前模型是否支持视觉（识别图片）
function modelSupportsVision(modelName) {
  const visionKeywords = ['vl', 'vision', 'v-', '-v', '4v', 'multimodal', 'vlm', 'gemini', 'flash', 'gpt-4o', 'gpt-4-vision', 'qwen-vl', 'glm-4v'];
  const modelLower = (modelName || '').toLowerCase();
  return visionKeywords.some(kw => modelLower.includes(kw));
}

async function estimateCalories(imageBase64, text) {
  const hasImage = !!imageBase64;
  const hasText = text && text.trim();

  if (!hasImage && !hasText) {
    throw new Error('请提供图片或文字描述');
  }

  // 有图片时，使用视觉模型配置（智谱 GLM-4V）
  let useImage = false;
  let visionConfig = null;
  if (hasImage) {
    visionConfig = getVisionAIConfig();
    if (visionConfig.apiKey && modelSupportsVision(visionConfig.model)) {
      useImage = true;
    } else if (!hasText) {
      throw new Error('检测到图片但未配置视觉模型（智谱 GLM-4V），请在设置中配置智谱 API Key，或改用文字描述食物');
    }
    // 有文字描述且没配视觉模型时，忽略图片只用文字
  }

  const textConfig = getAIConfig();
  const activeConfig = useImage ? visionConfig : textConfig;
  if (!activeConfig.apiKey) {
    throw new Error(useImage ? '请先在设置中配置智谱 API Key（视觉模型）' : '请先在设置中配置 DeepSeek API Key');
  }

  const systemPrompt = `你是一位专业的营养分析助手。请${useImage && hasText ? '根据图片和文字描述' : useImage ? '根据图片' : '根据文字描述'}识别食物并估算热量。

重要：你的回复必须是合法的 JSON 对象，不要添加任何 markdown 代码块标记（如 \`\`\`json），也不要添加任何 JSON 之外的中文说明或解释。

返回格式：
{
  "foods": [
    {
      "name": "食物名称",
      "portion": "估计份量（如：约150g、一碗、半个）",
      "calories": 估算热量数值（整数，单位kcal）
    }
  ],
  "total_calories": 总热量数值（整数）,
  "calorie_range_min": 最低可能热量（整数）,
  "calorie_range_max": 最高可能热量（整数）,
  "confidence": "高" | "中" | "低",
  "error_sources": "主要影响估算准确度的信息说明（如食物份量、用油量等无法准确判断的信息）",
  "meal_analysis": "针对本次这顿饭的简短饮食分析（2-4 句话），包括营养构成特点、热量水平是否合理、搭配是否均衡等",
  "warm_reminder": "一句带人文关怀的温馨建议（1-2 句话，比如"今天摄入了不少蔬菜，很棒！下次可以多补充些蛋白质哦"），语气亲切自然"
}

注意：
- 只返回 JSON，不要其他内容
- 如果有多种食物，分别列出每种
- 热量范围应合理反映估算的不确定性
- 如实说明影响准确度的因素
- 如果无法识别食物，返回 confidence 为"低"并说明原因`;

  const userContent = [];

  if (useImage) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageBase64 }
    });
  }

  if (hasText) {
    userContent.push({
      type: 'text',
      text: `食物描述：${text}`
    });
  } else if (useImage) {
    userContent.push({
      type: 'text',
      text: '请分析图片中的食物并估算热量。'
    });
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const result = await callAI(messages, { temperature: 0.3, max_tokens: 1500 }, activeConfig);
  return parseAIJSON(result);
}

// ============================
// AI - 重新估算
// ============================
async function reEstimate(previousResult, additionalText, imageBase64) {
  const hasImage = !!imageBase64;
  const hasText = additionalText && additionalText.trim();

  let useImage = false;
  let visionConfig = null;
  if (hasImage) {
    visionConfig = getVisionAIConfig();
    if (visionConfig.apiKey && modelSupportsVision(visionConfig.model)) {
      useImage = true;
    }
  }

  const activeConfig = useImage ? visionConfig : getAIConfig();

  const systemPrompt = `你是一位专业的营养分析助手。用户对之前的估算结果提供了补充信息，请结合补充信息重新估算热量。

之前估算结果：${JSON.stringify(previousResult)}
用户补充信息：${additionalText}

请以严格的 JSON 格式返回更新后的结果（不要包含 markdown 代码块标记）：
{
  "foods": [{"name":"食物名称","portion":"估计份量","calories":数值}],
  "total_calories": 总热量,
  "calorie_range_min": 最低热量,
  "calorie_range_max": 最高热量,
  "confidence": "高"|"中"|"低",
  "error_sources": "主要误差来源说明",
  "change_note": "本次修正了什么（简短说明）"
}`;

  const userContent = [];
  if (useImage) {
    userContent.push({ type: 'image_url', image_url: { url: imageBase64 } });
  }
  userContent.push({ type: 'text', text: `补充信息：${additionalText}` });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const result = await callAI(messages, { temperature: 0.3, max_tokens: 1500 }, activeConfig);
  return parseAIJSON(result);
}

// 简单 HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================
// AI - 今日分析
// ============================
async function generateDailyAnalysis(meals) {
  if (meals.length === 0) {
    throw new Error('今日还没有记录，先添加一些食物吧');
  }

  const mealsFormatted = meals.map(m =>
    `- ${MEAL_TYPES.find(t => t.key === m.meal_type)?.label || '其他'}：${m.food_name}（${m.calories} kcal${m.portion ? '，' + m.portion : ''}）`
  ).join('\n');

  const totalCalories = meals.reduce((sum, m) => sum + (m.calories || 0), 0);

  const systemPrompt = `你是一位温和、友好的营养分析助手。请根据今日饮食记录进行分析。

今日饮食记录：
${mealsFormatted}

今日总摄入：${totalCalories} kcal

请以严格的 JSON 格式返回分析（不要包含 markdown 代码块标记）：
{
  "summary": "今日热量摄入概况（1-2句话，描述总体情况）",
  "distribution": "各餐热量分布观察（1-2句话）",
  "observation": "饮食结构的简单观察（1-2句话）",
  "suggestion": "可执行、温和的饮食建议（1-2句话）"
}

重要原则：
- 避免因为单日摄入偏高或偏低就下结论
- 不要制造焦虑，语言要温和有陪伴感
- 不进行疾病诊断
- 建议要具体、可执行、温和`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请分析今日饮食。' }
  ];

  const result = await callAI(messages, { temperature: 0.7, max_tokens: 800 });
  return parseAIJSON(result);
}

// ============================
// AI - 报告生成
// ============================
async function generateAIReport(type, meals) {
  if (meals.length === 0) {
    throw new Error('该时段暂无饮食记录');
  }

  // 按日期分组统计
  const byDate = {};
  meals.forEach(m => {
    const d = m.record_date;
    if (!byDate[d]) byDate[d] = { total: 0, meals: [] };
    byDate[d].total += m.calories || 0;
    byDate[d].meals.push(m);
  });

  const dates = Object.keys(byDate).sort();
  const totals = dates.map(d => byDate[d].total);
  const avgCalories = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  const maxCal = Math.max(...totals);
  const minCal = Math.min(...totals);
  const recordDays = totals.length;

  // 各餐平均
  const mealTypeAvg = {};
  MEAL_TYPES.forEach(mt => {
    const mtMeals = meals.filter(m => m.meal_type === mt.key);
    if (mtMeals.length > 0) {
      const dailyTotals = {};
      mtMeals.forEach(m => {
        dailyTotals[m.record_date] = (dailyTotals[m.record_date] || 0) + (m.calories || 0);
      });
      const vals = Object.values(dailyTotals);
      mealTypeAvg[mt.key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  });

  // 高频食物
  const foodCounts = {};
  meals.forEach(m => {
    const name = m.food_name;
    foodCounts[name] = (foodCounts[name] || 0) + 1;
  });
  const topFoods = Object.entries(foodCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dataSummary = `数据概览：
- 记录天数：${recordDays}天
- 平均每日热量：${avgCalories} kcal
- 热量范围：${minCal} - ${maxCal} kcal
- 各餐平均热量：${Object.entries(mealTypeAvg).map(([k, v]) => `${MEAL_TYPES.find(t => t.key === k)?.label}: ${v}kcal`).join('，')}
- 高频食物：${topFoods.map(([n, c]) => `${n}(${c}次)`).join('，')}

每日明细：
${dates.map(d => `${d}: ${byDate[d].total} kcal（${byDate[d].meals.length}条记录）`).join('\n')}`;

  let question = '';
  let focus = '';

  if (type === 'daily') {
    question = '今天吃得怎么样？';
    focus = '请分析：今日总摄入、各餐摄入情况、简单的饮食结构分析、第二天可执行的建议。';
  } else if (type === 'weekly') {
    question = '这一周有什么规律？';
    focus = '请分析：平均每日热量、热量波动、各餐平均热量分布、高频食物或饮食模式、这一周出现的明显变化、下周可尝试的改进方向。';
  } else {
    question = '这个月的饮食习惯发生了什么变化？';
    focus = '请分析：月度平均热量、长期趋势变化、饮食结构变化、记录频率与稳定性、值得继续保持的习惯、下一阶段可尝试的方向。';
  }

  const systemPrompt = `你是一位温和、友好的营养分析助手。请根据饮食记录生成${type === 'daily' ? '日' : type === 'weekly' ? '周' : '月'}报。

核心问题：${question}

${dataSummary}

${focus}

请以严格的 JSON 格式返回报告（不要包含 markdown 代码块标记）：
{
  "title": "报告标题",
  "metrics": [
    {"label": "指标名称", "value": "指标值（含单位）"}
  ],
  "sections": [
    {"title": "段落标题", "content": "段落内容（2-4句话）"}
  ]
}

重要原则：
- 基于已有记录进行描述性分析和温和建议
- 避免因为单日摄入偏高或偏低就下结论
- 不制造焦虑，不进行疾病诊断
- 语言可以生动、有趣、有陪伴感，但保持清晰、客观、可执行
- metrics 放3-5个关键指标，sections 放3-5个分析段落`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请生成${type === 'daily' ? '日' : type === 'weekly' ? '周' : '月'}报。` }
  ];

  const result = await callAI(messages, { temperature: 0.7, max_tokens: 2000 });
  return parseAIJSON(result);
}

// ============================
// 图片处理
// ============================
function compressImage(file, options = {}) {
  const maxDim = options.maxDim || 640;
  const targetSizeKB = options.targetSizeKB || 450;
  const minQuality = options.minQuality || 0.5;

  return new Promise((resolve, reject) => {
    // 文件原始大小超过 8MB 直接拒绝
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('图片太大（超过 8MB），请选择更小的图片'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const tryCompress = (quality) => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', quality);
          const sizeKB = (base64.length * 0.75) / 1024;

          if (sizeKB > targetSizeKB && quality > minQuality) {
            // 降低质量继续压缩
            const nextQuality = Math.max(minQuality, quality - 0.12);
            setTimeout(() => tryCompress(nextQuality), 0);
          } else {
            resolve(base64);
          }
        };
        tryCompress(0.82);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================
// 工具函数
// ============================
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(date) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const weeks = ['日','一','二','三','四','五','六'];
  return `${months[date.getMonth()]}${date.getDate()}日 周${weeks[date.getDay()]}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function getConfidenceClass(confidence) {
  const c = (confidence || '').toLowerCase();
  if (c.includes('高')) return 'high';
  if (c.includes('中')) return 'medium';
  return 'low';
}

// ============================
// UI 渲染
// ============================
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));

  if (tab === 'today') {
    renderTodayTab();
  } else if (tab === 'reports') {
    renderReportsTab();
  } else if (tab === 'settings') {
    renderSettingsTab();
  }
}

function renderEstimateResult(result) {
  const card = document.getElementById('resultCard');
  const loadingCard = document.getElementById('loadingCard');

  loadingCard.style.display = 'none';
  card.style.display = 'block';

  // 总热量
  document.getElementById('totalCalories').textContent = `${result.total_calories || 0} kcal`;
  document.getElementById('totalRange').textContent =
    result.calorie_range_min && result.calorie_range_max
      ? `估算范围：${result.calorie_range_min} – ${result.calorie_range_max} kcal`
      : '';

  // 可信度
  const badge = document.getElementById('confidenceBadge');
  const conf = result.confidence || '低';
  badge.textContent = `可信度：${conf}`;
  badge.className = `confidence-badge ${getConfidenceClass(conf)}`;

  // 食物列表
  const foodList = document.getElementById('foodList');
  foodList.innerHTML = '';
  if (result.foods && result.foods.length > 0) {
    result.foods.forEach(food => {
      const item = document.createElement('div');
      item.className = 'food-item';
      item.innerHTML = `
        <div class="food-item-info">
          <span class="food-item-name">${food.name}</span>
          ${food.portion ? `<span class="food-item-portion">${food.portion}</span>` : ''}
        </div>
        <span class="food-item-calories">${food.calories} kcal</span>
      `;
      foodList.appendChild(item);
    });
  }

  // 误差来源
  const errorBox = document.getElementById('errorSources');
  if (result.error_sources) {
    errorBox.style.display = 'block';
    document.getElementById('errorSourcesText').textContent = result.error_sources;
  } else {
    errorBox.style.display = 'none';
  }

  // 重新估算区
  document.getElementById('reEstimateArea').style.display = 'block';

  // 变更说明（重新估算后）
  if (result.change_note) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'error-sources';
    noteDiv.style.borderLeftColor = '#22C55E';
    noteDiv.style.background = '#DCFCE7';
    noteDiv.innerHTML = `
      <div class="error-label" style="color:#166534">🔄 估算已更新</div>
      <p style="color:#166534">${result.change_note}</p>
    `;
    errorBox.parentNode.insertBefore(noteDiv, errorBox.nextSibling);
  }
}

function renderTodayTab() {
  const dateStr = formatDate(state.currentDate);
  const meals = state.meals;

  // 总热量
  const total = meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  document.getElementById('todayTotalCalories').textContent = total;

  // 热量对比（传入已吃食物用于个性化建议）
  renderCalorieCompare(total, meals);

  // 各餐次
  const container = document.getElementById('mealSections');
  container.innerHTML = '';

  MEAL_TYPES.forEach(mt => {
    const mtMeals = meals.filter(m => m.meal_type === mt.key);
    const mtTotal = mtMeals.reduce((sum, m) => sum + (m.calories || 0), 0);

    const section = document.createElement('div');
    section.className = 'meal-section';

    section.innerHTML = `
      <div class="meal-section-header">
        <span class="meal-section-title">${mt.icon} ${mt.label}</span>
        <span class="meal-section-calories">${mtTotal > 0 ? mtTotal + ' kcal' : '—'}</span>
      </div>
      <div class="meal-section-body">
        ${mtMeals.length === 0
          ? '<div class="empty-state">暂无记录</div>'
          : mtMeals.map(m => `
            <div class="meal-record" data-id="${m.id}">
              <div class="meal-record-info">
                <span class="meal-record-name">${m.food_name}</span>
                <span class="meal-record-time">${formatTime(m.record_time)} ${m.confidence ? '· ' + m.confidence : ''}</span>
              </div>
              <span class="meal-record-calories">${m.calories} kcal</span>
              <div class="meal-record-actions">
                <button onclick="openEditModal('${m.id}')">✏️</button>
              </div>
              ${m.notes ? `<div class="meal-record-notes">${escapeHtml(m.notes).replace(/\\n/g, '<br>')}</div>` : ''}
            </div>
          `).join('')
        }
      </div>
    `;
    container.appendChild(section);
  });

  // 显示已有的分析
  const analysisKey = `analysis_${state.roomCode}_${dateStr}`;
  const savedAnalysis = localStorage.getItem(analysisKey);
  if (savedAnalysis) {
    const analysis = JSON.parse(savedAnalysis);
    document.getElementById('dailyAnalysisCard').style.display = 'block';
    renderAnalysis(analysis);
    document.getElementById('generateAnalysisBtn').style.display = 'none';
  } else {
    document.getElementById('dailyAnalysisCard').style.display = 'none';
    document.getElementById('generateAnalysisBtn').style.display = meals.length > 0 ? 'block' : 'none';
  }
}

function renderCalorieCompare(total, meals) {
  const card = document.getElementById('calorieCompareCard');
  const dailyBurn = getEffectiveDailyBurn();

  if (!dailyBurn || dailyBurn <= 0) {
    card.style.display = 'none';
    document.getElementById('catObservationCard').style.display = 'none';
    return;
  }

  card.style.display = 'block';
  meals = meals || [];

  const lowerBound = Math.round(dailyBurn * 0.9);
  const upperBound = Math.round(dailyBurn * 1.1);
  const maxScale = Math.max(dailyBurn * 1.5, total * 1.2);

  // 进度条
  const fillPercent = Math.min(100, (total / maxScale) * 100);
  const normalStartPercent = (lowerBound / maxScale) * 100;
  const normalWidthPercent = ((upperBound - lowerBound) / maxScale) * 100;
  const markerPercent = Math.min(100, (dailyBurn / maxScale) * 100);

  const bar = document.getElementById('calorieCompareBar');
  const normalZone = document.getElementById('calorieCompareNormal');
  const marker = document.getElementById('calorieCompareMarker');

  bar.style.width = fillPercent + '%';
  normalZone.style.left = normalStartPercent + '%';
  normalZone.style.width = normalWidthPercent + '%';
  marker.style.left = `calc(${markerPercent}% - 1.5px)`;

  // 分析已吃食物
  let barColor, statusText, statusColor, detailText;

  if (total < lowerBound) {
    // ─── 摄入不足 ───
    barColor = 'linear-gradient(90deg, #60A5FA, #3B82F6)';
    statusText = '📉 摄入不足';
    statusColor = '#3B82F6';
    const remaining = lowerBound - total;
    detailText = `今日还差 <strong>${remaining}</strong> kcal 才能达到正常范围（${lowerBound}-${upperBound} kcal）`;

  } else if (total > upperBound) {
    // ─── 摄入超标 ───
    barColor = 'linear-gradient(90deg, #F87171, #EF4444)';
    statusText = '📈 摄入超标';
    statusColor = '#EF4444';
    const excess = total - upperBound;
    detailText = `今日已超过正常范围上限 <strong>${excess}</strong> kcal（正常范围 ${lowerBound}-${upperBound} kcal）`;

  } else {
    // ─── 正常范围 ───
    barColor = 'linear-gradient(90deg, #4ADE80, #22C55E)';
    statusText = '✅ 摄入正常';
    statusColor = '#22C55E';
    detailText = `在正常范围内（${lowerBound}-${upperBound} kcal），保持得很好！`;
  }

  bar.style.background = barColor;

  const info = document.getElementById('calorieCompareInfo');
  info.innerHTML = `
    <div class="calorie-compare-status" style="color:${statusColor};">${statusText}</div>
    <div class="calorie-compare-detail">${detailText}</div>
    <div style="margin-top:4px;font-size:11px;color:#999;">日均消耗 ${dailyBurn} kcal · 正常区间 ${lowerBound}-${upperBound} kcal</div>
  `;

  // 显示小猫观察卡片（不自动生成对话，等用户点击小猫）
  showCatCard(meals, total, dailyBurn, lowerBound, upperBound);
}

// ============================
// AI今日观察 - 小猫对话模块
// ============================

const FOOD_CATEGORIES = {
  carbs:   { label: '主食', keywords: ['米饭','面条','馒头','面包','米粉','粥','燕麦','玉米','红薯','土豆','饼','糕','馄饨','饺子','包子','炒饭','意面','乌冬','拉面','寿司','饭团','糍','肠粉'] },
  protein: { label: '蛋白质', keywords: ['鸡蛋','牛肉','猪肉','鸡肉','鸭肉','鱼肉','鱼','虾','蟹','豆腐','排骨','肉','鸡腿','鸡胸','培根','火腿','香肠','三文鱼','金枪鱼','蛤蜊','扇贝','鱿鱼','羊肉'] },
  veggie:  { label: '蔬菜', keywords: ['蔬菜','白菜','菠菜','西兰花','青菜','时蔬','番茄','西红柿','黄瓜','茄子','豆角','萝卜','芹菜','生菜','油麦菜','空心菜','丝瓜','冬瓜','苦瓜','芦笋','蘑菇','木耳','海带','豆芽'] },
  fruit:   { label: '水果', keywords: ['苹果','香蕉','橘子','橙子','西瓜','葡萄','梨','草莓','蓝莓','芒果','猕猴桃','火龙果','榴莲','菠萝','哈密瓜','水果','圣女果'] },
  drink:   { label: '饮品类', keywords: ['牛奶','酸奶','咖啡','奶茶','果汁','豆浆','茶','可乐','雪碧','蜂蜜水','柠檬水'] },
  snack:   { label: '零食/甜点', keywords: ['薯片','巧克力','糖果','饼干','蛋糕','冰淇淋','布丁','坚果','瓜子','花生','辣条','爆米花','甜甜圈'] },
};

function analyzeMeals(meals) {
  const result = {
    categories: { carbs: [], protein: [], veggie: [], fruit: [], drink: [], snack: [] },
    mealTypes: [],
    foodNames: [],
    totalItems: 0,
  };
  meals.forEach(m => {
    const name = (m.food_name || '').toLowerCase();
    result.foodNames.push(m.food_name || '');
    result.totalItems++;
    if (m.meal_type && !result.mealTypes.includes(m.meal_type)) {
      result.mealTypes.push(m.meal_type);
    }
    Object.entries(FOOD_CATEGORIES).forEach(([key, cat]) => {
      if (cat.keywords.some(kw => name.includes(kw))) {
        result.categories[key].push(m.food_name || '');
      }
    });
  });
  result.missingCategories = Object.entries(result.categories)
    .filter(([_, foods]) => foods.length === 0).map(([key]) => key);
  result.presentCategories = Object.entries(result.categories)
    .filter(([_, foods]) => foods.length > 0).map(([key]) => key);
  return result;
}

// 小猫SVG头像 - 根据时段和情绪
function getCatSVG(mood) {
  const hour = new Date().getHours();
  let timeOfDay = 'day';
  if (hour >= 5 && hour < 11) timeOfDay = 'morning';
  else if (hour >= 11 && hour < 14) timeOfDay = 'noon';
  else if (hour >= 14 && hour < 18) timeOfDay = 'afternoon';
  else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
  else timeOfDay = 'night';

  let accessory = '';
  if (timeOfDay === 'night') {
    accessory = '<path d="M18 8 Q26 2 34 8 L34 6 Q26 9 18 6 Z" fill="#5C6BC0"/><circle cx="24" cy="5" r="1.2" fill="#FFD54F"/><circle cx="30" cy="5" r="1.2" fill="#FFD54F"/>';
  } else if (timeOfDay === 'morning') {
    accessory = '<circle cx="42" cy="10" r="3.5" fill="#FFD54F" opacity="0.8"/>';
  }

  let eyes, mouth, blush;
  if (mood === 'happy') {
    eyes = '<path d="M18 22 Q20 19 22 22" stroke="#4E342E" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M30 22 Q32 19 34 22" stroke="#4E342E" stroke-width="2" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M23 29 Q26 32 29 29" stroke="#4E342E" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    blush = '<ellipse cx="16" cy="27" rx="3" ry="2" fill="#FFAB91" opacity="0.6"/><ellipse cx="36" cy="27" rx="3" ry="2" fill="#FFAB91" opacity="0.6"/>';
  } else if (mood === 'concerned') {
    eyes = '<circle cx="20" cy="22" r="2" fill="#4E342E"/><circle cx="32" cy="22" r="2" fill="#4E342E"/>';
    mouth = '<path d="M23 30 Q26 28 29 30" stroke="#4E342E" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    blush = '';
  } else if (mood === 'worried') {
    eyes = '<path d="M18 21 L22 23" stroke="#4E342E" stroke-width="2" stroke-linecap="round"/><path d="M30 23 L34 21" stroke="#4E342E" stroke-width="2" stroke-linecap="round"/>';
    mouth = '<path d="M23 31 Q26 29 29 31" stroke="#4E342E" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    blush = '';
  } else {
    eyes = '<circle cx="20" cy="22" r="2.5" fill="#4E342E"/><circle cx="32" cy="22" r="2.5" fill="#4E342E"/><circle cx="20.5" cy="21" r="0.8" fill="#fff"/><circle cx="32.5" cy="21" r="0.8" fill="#fff"/>';
    mouth = '<path d="M24 29 Q26 30.5 28 29" stroke="#4E342E" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    blush = '<ellipse cx="16" cy="27" rx="2.5" ry="1.5" fill="#FFAB91" opacity="0.4"/><ellipse cx="36" cy="27" rx="2.5" ry="1.5" fill="#FFAB91" opacity="0.4"/>';
  }

  return '<svg viewBox="0 0 52 48" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M10 14 L14 4 L20 12 Z" fill="#FFB74D"/>' +
    '<path d="M34 12 L40 4 L44 14 Z" fill="#FFB74D"/>' +
    '<path d="M12 12 L14 7 L18 11 Z" fill="#FFCCBC"/>' +
    '<path d="M36 11 L40 7 L42 12 Z" fill="#FFCCBC"/>' +
    '<ellipse cx="26" cy="24" rx="18" ry="16" fill="#FFB74D"/>' +
    '<path d="M26 8 Q26 12 26 14" stroke="#FF9800" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path d="M20 9 Q21 12 21 13" stroke="#FF9800" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M31 13 Q31 12 32 9" stroke="#FF9800" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
    eyes +
    '<path d="M25 26 L26 27.5 L27 26 Z" fill="#FF8A65"/>' +
    mouth +
    blush +
    '<line x1="4" y1="25" x2="14" y2="26" stroke="#BCAAA4" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="4" y1="28" x2="14" y2="28" stroke="#BCAAA4" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="38" y1="26" x2="48" y2="25" stroke="#BCAAA4" stroke-width="1" stroke-linecap="round"/>' +
    '<line x1="38" y1="28" x2="48" y2="28" stroke="#BCAAA4" stroke-width="1" stroke-linecap="round"/>' +
    accessory +
    '</svg>';
}

// 猫咪观察状态管理
let catObservationState = {
  loading: false,
  cache: {},
};

function getCatCacheKey() {
  return formatDate(state.currentDate) + '_' + (state.currentProfileId || 'default');
}

function triggerCatObservation(meals, total, dailyBurn, lowerBound, upperBound) {
  // 不再自动触发，改为用户点击小猫时触发
  showCatCard(meals, total, dailyBurn, lowerBound, upperBound);
}

// 显示小猫卡片：有缓存就显示缓存，无缓存显示提示
function showCatCard(meals, total, dailyBurn, lowerBound, upperBound) {
  const card = document.getElementById('catObservationCard');
  if (!dailyBurn || dailyBurn <= 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  const cacheKey = getCatCacheKey();
  const cached = catObservationState.cache[cacheKey];
  const currentMealCount = (meals || state.meals || []).length;
  // 有有效缓存：直接显示
  if (cached && (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000) && cached.mealCount === currentMealCount) {
    renderCatObservation(cached.text, cached.mood);
  } else {
    // 无缓存：显示初始提示
    renderCatInitial();
  }
}

// 初始提示状态：小猫 + "点我聊聊~"
function renderCatInitial() {
  const avatar = document.getElementById('catAvatar');
  const loading = document.getElementById('catSpeechLoading');
  const content = document.getElementById('catSpeechContent');
  avatar.innerHTML = getCatSVG('neutral');
  avatar.classList.add('hint');
  loading.style.display = 'none';
  content.classList.add('active');
  content.innerHTML = '<div class="obs-text" style="color:#F57C00;font-size:13px;">🐱 点我看看今日饮食观察~</div>';
}

// 用户点击小猫头像时触发
function onCatAvatarClick() {
  if (catObservationState.loading) return;

  // 移除提示动画
  const avatar = document.getElementById('catAvatar');
  avatar.classList.remove('hint');

  // 检查缓存
  const cacheKey = getCatCacheKey();
  const cached = catObservationState.cache[cacheKey];
  const currentMealCount = state.meals.length;
  if (cached && (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000) && cached.mealCount === currentMealCount) {
    renderCatObservation(cached.text, cached.mood);
    return;
  }

  // 生成新的观察
  const dailyBurn = getEffectiveDailyBurn();
  if (!dailyBurn) return;
  const total = state.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const lowerBound = Math.round(dailyBurn * 0.9);
  const upperBound = Math.round(dailyBurn * 1.1);
  generateCatObservation(state.meals, total, dailyBurn, lowerBound, upperBound);
}

function renderCatObservation(text, mood) {
  const avatar = document.getElementById('catAvatar');
  const loading = document.getElementById('catSpeechLoading');
  const content = document.getElementById('catSpeechContent');
  avatar.innerHTML = getCatSVG(mood);
  avatar.classList.remove('hint');
  loading.style.display = 'none';
  content.classList.add('active');
  content.innerHTML = text;
}

function renderCatLoading(mood) {
  const avatar = document.getElementById('catAvatar');
  const loading = document.getElementById('catSpeechLoading');
  const content = document.getElementById('catSpeechContent');
  avatar.innerHTML = getCatSVG(mood);
  avatar.classList.remove('hint');
  loading.style.display = 'flex';
  content.classList.remove('active');
  content.innerHTML = '';
}

async function generateCatObservation(meals, total, dailyBurn, lowerBound, upperBound) {
  catObservationState.loading = true;
  const refreshBtn = document.getElementById('catRefreshBtn');
  if (refreshBtn) refreshBtn.disabled = true;

  let mood = 'neutral';
  if (total < lowerBound) mood = 'concerned';
  else if (total > upperBound) mood = 'worried';
  else mood = 'happy';
  renderCatLoading(mood);

  try {
    const config = getAIConfig();
    if (!config.apiKey) {
      const fallback = generateLocalObservation(meals, total, dailyBurn, lowerBound, upperBound);
      catObservationState.cache[getCatCacheKey()] = { text: fallback.text, mood: fallback.mood, timestamp: Date.now(), mealCount: meals.length };
      renderCatObservation(fallback.text, fallback.mood);
      return;
    }

    // 准备今日数据（不传record_time，避免AI误当吃饭时间）
    const todayData = meals.map(m => ({
      meal: MEAL_TYPES.find(t => t.key === m.meal_type)?.label || '其他',
      food: m.food_name,
      calories: m.calories,
      portion: m.portion || '',
    }));

    // 加载历史30天数据
    let historyData = [];
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      historyData = await loadMealsRangeFromCloud(formatDate(start), formatDate(now));
    } catch(e) {
      console.warn('Load history failed:', e);
    }

    // 按日期分组历史数据
    const historyByDate = {};
    historyData.forEach(m => {
      const d = m.record_date;
      if (!historyByDate[d]) historyByDate[d] = { meals: [], total: 0 };
      historyByDate[d].meals.push({ food: m.food_name, meal: m.meal_type, calories: m.calories });
      historyByDate[d].total += m.calories || 0;
    });

    const historySummary = Object.entries(historyByDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
      .map(([date, info]) => date + ': ' + info.meals.map(m => m.food).join('、') + ' (' + info.total + 'kcal)')
      .join('\n');

    const currentHour = new Date().getHours();
    const analysis = analyzeMeals(meals);

    const systemPrompt = '你是一只陪伴用户记录饮食的小猫，名叫"咪"。性格INFJ——温柔、有洞察力、善于发现用户饮食中的小细节。\n基于用户今日及近期历史饮食记录，生成一段"今日观察"。\n\n要求：\n1. 像朋友聊天一样自然，不说教，不制造焦虑\n2. 有点幽默，有点陪伴感\n3. 可用可爱颜文字或emoji（如 ✨🌱🍜💫）\n4. 不超过150字\n5. 不要重复，每次都要有新的角度\n6. 结合今日记录和历史记录分析，找出最值得关注的一点\n7. 偶尔自称"咪"\n\n输出格式（三部分，用换行分隔）：\n第一行：今日观察（温暖的分析或发现）\n第二行：💡 为什么这样判断（简短依据）\n第三行：🌱 小建议（一个具体可操作的建议）\n\n禁止：重复固定建议、制造焦虑、医学诊断、根据不足数据下结论、推测用户几点吃饭或点评用餐时间。';

    const userPrompt = '当前时间：' + currentHour + '时\n' +
      '日消耗目标：' + dailyBurn + ' kcal（正常区间' + lowerBound + '-' + upperBound + '）\n' +
      '今日已摄入：' + total + ' kcal\n' +
      '今日餐次记录：\n' + (todayData.length > 0 ?
        todayData.map(d => '  ' + d.meal + ' - ' + d.food + (d.portion ? '(' + d.portion + ')' : '') + ' ' + d.calories + 'kcal').join('\n')
        : '  （暂无记录）') + '\n\n' +
      '近期7天历史记录：\n' + (historySummary || '（暂无历史记录）') + '\n\n' +
      '今日食物类别分析：已吃' + analysis.presentCategories.map(c => FOOD_CATEGORIES[c].label).join('、') +
      (analysis.missingCategories.length > 0 ? '，缺' + analysis.missingCategories.map(c => FOOD_CATEGORIES[c].label).join('、') : '') + '\n\n' +
      '请生成今日观察。';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callAI(messages, { temperature: 0.9, max_tokens: 500 });

    // 解析AI回复
    let rawText = '';
    if (typeof response === 'string') {
      rawText = response;
    } else if (response && response.choices && response.choices[0]) {
      rawText = response.choices[0].message?.content || '';
    } else if (response && response.content) {
      rawText = response.content;
    }

    rawText = rawText.trim();
    if (!rawText) throw new Error('AI返回为空');

    // 将回复格式化为HTML
    const lines = rawText.split('\n').filter(l => l.trim());
    let html = '';
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('💡')) {
        html += '<div class="obs-why">' + escapeHtml(trimmed) + '</div>';
      } else if (trimmed.startsWith('🌱')) {
        html += '<div class="obs-tip">' + escapeHtml(trimmed) + '</div>';
      } else {
        html += '<div class="obs-text">' + escapeHtml(trimmed) + '</div>';
      }
    });

    if (!html) html = '<div class="obs-text">' + escapeHtml(rawText) + '</div>';

    catObservationState.cache[getCatCacheKey()] = { text: html, mood: mood, timestamp: Date.now(), mealCount: meals.length };
    renderCatObservation(html, mood);

  } catch(e) {
    console.warn('Cat observation AI failed:', e);
    const fallback = generateLocalObservation(meals, total, dailyBurn, lowerBound, upperBound);
    catObservationState.cache[getCatCacheKey()] = { text: fallback.text, mood: fallback.mood, timestamp: Date.now(), mealCount: meals.length };
    renderCatObservation(fallback.text, fallback.mood);
  } finally {
    catObservationState.loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

// 无API Key或AI失败时的本地fallback
function generateLocalObservation(meals, total, dailyBurn, lowerBound, upperBound) {
  const analysis = analyzeMeals(meals);
  const hour = new Date().getHours();
  const mealCount = analysis.totalItems;
  const isMultiMeal = analysis.mealTypes.filter(t => t !== 'other').length >= 2;

  let mood, text;

  if (total < lowerBound) {
    mood = 'concerned';
    const remaining = lowerBound - total;
    if (mealCount === 0) {
      text = '<div class="obs-text">今天还没开始记录哦～咪在这里等你吃什么 🐱</div>' +
        '<div class="obs-why">💡 还没有记录任何食物，等你吃了东西记得来告诉我呀</div>' +
        '<div class="obs-tip">🌱 先从一顿简单的早餐或午餐开始记录吧</div>';
    } else {
      const missingCats = analysis.missingCategories.slice(0, 2).map(c => FOOD_CATEGORIES[c].label).join('、');
      text = '<div class="obs-text">今天还差' + remaining + 'kcal才到正常范围，' +
        (missingCats ? '可以补点' + missingCats : '再来点小食') + '哦 ✨</div>' +
        '<div class="obs-why">💡 已吃' + analysis.presentCategories.map(c => FOOD_CATEGORIES[c].label).join('、') +
        (missingCats ? '，还缺' + missingCats : '') + '</div>' +
        '<div class="obs-tip">🌱 ' + (missingCats ? '优先补充' + missingCats + '类食物' : '选个喜欢的小食补充一下热量吧') + '</div>';
    }
  } else if (total > upperBound) {
    mood = 'worried';
    const excess = total - upperBound;
    const walkMin = Math.max(10, Math.ceil(excess / 5 / 5) * 5);
    let lead = '今天热量有点超了';
    if (analysis.categories.snack.length > 0) lead = '零食好像吃得有点多呢';
    else if (analysis.categories.carbs.length > 2) lead = '今天主食偏多了一些';
    else if (analysis.categories.protein.length > 0 && analysis.categories.veggie.length === 0) lead = '吃了肉但蔬菜还不够呀';

    text = '<div class="obs-text">' + lead + '，超出' + excess + 'kcal，动一动就好啦 🌸</div>' +
      '<div class="obs-why">💡 今日摄入' + total + 'kcal，正常上限' + upperBound + 'kcal</div>' +
      '<div class="obs-tip">🌱 快走' + walkMin + '分钟就能消耗掉，不难的～</div>';
  } else {
    mood = 'happy';
    const presentCount = analysis.presentCategories.length;
    let comment = '今天热量控制得不错！';
    if (presentCount >= 4) comment = '今天营养搭配很均衡，咪给你盖个小印章 📌';
    else if (presentCount >= 2) comment = '今天吃得还不错，热量也在合理范围内 ✨';
    else if (mealCount === 0) comment = '今天还没记录饮食哦～';

    text = '<div class="obs-text">' + comment + '</div>' +
      '<div class="obs-why">💡 摄入' + total + 'kcal在正常区间' + lowerBound + '-' + upperBound + '内</div>' +
      '<div class="obs-tip">🌱 ' + (presentCount >= 4 ? '继续保持这个节奏就好啦' : '可以再加点蔬菜或水果让营养更全面') + '</div>';
  }

  return { text, mood };
}

// 手动刷新猫咪观察
function refreshCatObservation() {
  if (catObservationState.loading) return;
  const cacheKey = getCatCacheKey();
  if (catObservationState.cache[cacheKey]) {
    delete catObservationState.cache[cacheKey];
  }
  const dailyBurn = getEffectiveDailyBurn();
  if (!dailyBurn) return;
  const total = state.meals.reduce((sum, m) => sum + (m.calories || 0), 0);
  const lowerBound = Math.round(dailyBurn * 0.9);
  const upperBound = Math.round(dailyBurn * 1.1);
  generateCatObservation(state.meals, total, dailyBurn, lowerBound, upperBound);
}

function renderAnalysis(analysis) {
  const body = document.getElementById('dailyAnalysisBody');
  body.innerHTML = `
    <div class="analysis-item">
      <div class="analysis-item-label">📊 今日概况</div>
      <div class="analysis-item-text">${analysis.summary || ''}</div>
    </div>
    <div class="analysis-item">
      <div class="analysis-item-label">🍽️ 餐次分布</div>
      <div class="analysis-item-text">${analysis.distribution || ''}</div>
    </div>
    <div class="analysis-item">
      <div class="analysis-item-label">🥗 饮食观察</div>
      <div class="analysis-item-text">${analysis.observation || ''}</div>
    </div>
    <div class="analysis-item">
      <div class="analysis-item-label">💡 温和建议</div>
      <div class="analysis-item-text">${analysis.suggestion || ''}</div>
    </div>
  `;
}

function renderReportsTab() {
  const type = state.currentReportType;
  const now = state.currentDate;
  let dateInfo = '';

  if (type === 'daily') {
    dateInfo = formatDateDisplay(now);
  } else if (type === 'weekly') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    dateInfo = `${formatDate(start)} 至 ${formatDate(now)}`;
  } else {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    dateInfo = `${formatDate(start)} 至 ${formatDate(now)}`;
  }

  document.getElementById('reportDateInfo').textContent = dateInfo;
}

function renderReport(report) {
  const card = document.getElementById('reportCard');
  const body = document.getElementById('reportBody');
  const loading = document.getElementById('reportLoading');

  loading.style.display = 'none';
  card.style.display = 'block';

  let html = '';

  // 指标
  if (report.metrics && report.metrics.length > 0) {
    html += '<div class="report-metrics">';
    report.metrics.forEach(m => {
      html += `
        <div class="report-metric">
          <div class="report-metric-value">${m.value}</div>
          <div class="report-metric-label">${m.label}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  // 段落
  if (report.sections && report.sections.length > 0) {
    report.sections.forEach(s => {
      html += `
        <div class="report-section">
          <h4>${s.title}</h4>
          <p>${s.content}</p>
        </div>
      `;
    });
  }

  body.innerHTML = html;
}

function renderSettingsTab() {
  // AI 配置 - 文字模型
  const config = getAIConfig();
  document.getElementById('aiBaseUrl').value = config.baseUrl;
  document.getElementById('aiApiKey').value = config.apiKey;
  document.getElementById('aiModel').value = config.model;

  // AI 配置 - 视觉模型
  const visionConfig = getVisionAIConfig();
  document.getElementById('aiVisionBaseUrl').value = visionConfig.baseUrl;
  document.getElementById('aiVisionApiKey').value = visionConfig.apiKey;
  document.getElementById('aiVisionModel').value = visionConfig.model;

  // 同步状态
  const indicator = document.getElementById('syncIndicator');
  const statusText = document.getElementById('syncStatusText');
  const dbSetup = document.getElementById('dbSetup');

  if (state.supabaseReady) {
    indicator.textContent = '✅';
    statusText.textContent = '云端同步已就绪';
    dbSetup.style.display = 'none';
  } else {
    indicator.textContent = '⚠️';
    statusText.textContent = '数据库未配置';
    dbSetup.style.display = 'block';

    // 显示 SQL
    const sqlContent = document.getElementById('sqlContent');
    if (!sqlContent.textContent) {
      fetch('/supabase/schema.sql').then(r => r.ok ? r.text() : '').then(t => {
        sqlContent.textContent = t;
      }).catch(() => {});
    }
  }

  // 房间码
  document.getElementById('roomCodeInput').value = state.roomCode;
}

// ============================
// 餐次选择弹窗
// ============================
function openMealTypeModal() {
  const grid = document.getElementById('mealTypeGrid');
  grid.innerHTML = '';
  MEAL_TYPES.forEach(mt => {
    const option = document.createElement('div');
    option.className = 'meal-type-option';
    option.innerHTML = `
      <div class="meal-type-icon">${mt.icon}</div>
      <div class="meal-type-label">${mt.label}</div>
    `;
    option.onclick = () => {
      closeMealTypeModal();
      recordMeal(mt.key);
    };
    grid.appendChild(option);
  });
  document.getElementById('mealTypeModal').style.display = 'flex';
}

function closeMealTypeModal() {
  document.getElementById('mealTypeModal').style.display = 'none';
}

// ============================
// 编辑弹窗
// ============================
function openEditModal(mealId) {
  const meal = state.meals.find(m => m.id === mealId);
  if (!meal) return;

  state.editingMealId = mealId;
  document.getElementById('editFoodName').value = meal.food_name || '';
  document.getElementById('editCalories').value = meal.calories || '';
  document.getElementById('editNotes').value = meal.notes || '';

  const select = document.getElementById('editMealType');
  select.innerHTML = MEAL_TYPES.map(mt =>
    `<option value="${mt.key}" ${mt.key === meal.meal_type ? 'selected' : ''}>${mt.icon} ${mt.label}</option>`
  ).join('');

  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  state.editingMealId = null;
}

// ============================
// 手动输入弹窗
// ============================
function openManualModal() {
  const select = document.getElementById('manualMealType');
  select.innerHTML = MEAL_TYPES.map(mt =>
    `<option value="${mt.key}">${mt.icon} ${mt.label}</option>`
  ).join('');

  // 根据当前时间选择默认餐次
  const hour = new Date().getHours();
  let defaultType = 'other';
  if (hour >= 5 && hour < 10) defaultType = 'breakfast';
  else if (hour >= 10 && hour < 14) defaultType = 'lunch';
  else if (hour >= 14 && hour < 17) defaultType = 'afternoon_tea';
  else if (hour >= 17 && hour < 21) defaultType = 'dinner';
  else if (hour >= 21) defaultType = 'late_night';
  select.value = defaultType;

  document.getElementById('manualFoodName').value = '';
  document.getElementById('manualCalories').value = '';
  document.getElementById('manualModal').style.display = 'flex';
}

function closeManualModal() {
  document.getElementById('manualModal').style.display = 'none';
}

// ============================
// 记录操作
// ============================
async function recordMeal(mealType) {
  if (!state.estimationResult) return;

  const result = state.estimationResult;
  const dateStr = formatDate(state.currentDate);

  // 构建备注：用户原始输入 + AI 饮食分析 + 人文关怀
  let notes = null;
  const parts = [];
  const userInput = document.getElementById('foodText').value;
  if (userInput && !state.currentImageBase64) {
    parts.push(`描述：${userInput}`);
  }
  if (result.meal_analysis) {
    parts.push(`🍽 ${result.meal_analysis}`);
  }
  if (result.warm_reminder) {
    parts.push(`💬 ${result.warm_reminder}`);
  }
  if (parts.length > 0) notes = parts.join('\n');

  const meal = {
    id: generateLocalId(),
    room_code: state.roomCode,
    food_name: result.foods.map(f => f.name).join('、'),
    portion: result.foods.map(f => f.portion).filter(Boolean).join('；'),
    calories: result.total_calories || result.foods.reduce((s, f) => s + (f.calories || 0), 0),
    calorie_min: result.calorie_range_min || null,
    calorie_max: result.calorie_range_max || null,
    confidence: result.confidence || null,
    error_sources: result.error_sources || null,
    meal_type: mealType,
    record_date: dateStr,
    record_time: new Date().toISOString(),
    notes: notes,
    image_data: null,
    ai_response: result,
    input_text: userInput || null,
  };

  // 保存到云端
  if (state.supabaseReady) {
    const cloudMeal = { ...meal };
    delete cloudMeal.id; // 让数据库生成 id
    const saved = await saveMealToCloud(cloudMeal);
    if (saved) {
      meal.id = saved.id;
    }
  }

  // 保存到本地
  state.meals.push(meal);
  saveLocalMeals(dateStr, state.meals);

  // 清理估算
  resetEstimateUI();

  showToast('✅ 已记入今日摄入');

  // 切换到今日页
  switchTab('today');
}

async function saveManualEntry() {
  const foodName = document.getElementById('manualFoodName').value.trim();
  const caloriesInput = document.getElementById('manualCalories').value;
  const mealType = document.getElementById('manualMealType').value;

  if (!foodName) {
    showToast('请输入食物名称');
    return;
  }

  const dateStr = formatDate(state.currentDate);

  if (caloriesInput) {
    // 直接记录
    const meal = {
      id: generateLocalId(),
      room_code: state.roomCode,
      food_name: foodName,
      calories: parseInt(caloriesInput),
      meal_type: mealType,
      record_date: dateStr,
      record_time: new Date().toISOString(),
      notes: '手动输入',
    };

    if (state.supabaseReady) {
      const cloudMeal = { ...meal };
      delete cloudMeal.id;
      const saved = await saveMealToCloud(cloudMeal);
      if (saved) meal.id = saved.id;
    }

    state.meals.push(meal);
    saveLocalMeals(dateStr, state.meals);
    closeManualModal();
    showToast('✅ 已记录');
    renderTodayTab();
  } else {
    // AI 估算
    closeManualModal();
    showLoading('正在估算热量...');

    try {
      const result = await estimateCalories(null, foodName);
      state.estimationResult = result;
      hideLoading();
      renderEstimateResult(result);

      // 自动选择餐次并记录
      const meal = {
        id: generateLocalId(),
        room_code: state.roomCode,
        food_name: result.foods.map(f => f.name).join('、'),
        portion: result.foods.map(f => f.portion).filter(Boolean).join('；'),
        calories: result.total_calories || result.foods.reduce((s, f) => s + (f.calories || 0), 0),
        calorie_min: result.calorie_range_min || null,
        calorie_max: result.calorie_range_max || null,
        confidence: result.confidence || null,
        meal_type: mealType,
        record_date: dateStr,
        record_time: new Date().toISOString(),
        notes: `输入：${foodName}`,
        ai_response: result,
        input_text: foodName,
      };

      if (state.supabaseReady) {
        const cloudMeal = { ...meal };
        delete cloudMeal.id;
        const saved = await saveMealToCloud(cloudMeal);
        if (saved) meal.id = saved.id;
      }

      state.meals.push(meal);
      saveLocalMeals(dateStr, state.meals);
      resetEstimateUI();
      showToast('✅ AI 估算并记录成功');
      switchTab('today');
    } catch (e) {
      hideLoading();
      showToast('❌ ' + e.message);
    }
  }
}

async function saveEdit() {
  if (!state.editingMealId) return;

  const meal = state.meals.find(m => m.id === state.editingMealId);
  if (!meal) return;

  const updates = {
    food_name: document.getElementById('editFoodName').value.trim(),
    calories: parseInt(document.getElementById('editCalories').value) || 0,
    meal_type: document.getElementById('editMealType').value,
    notes: document.getElementById('editNotes').value.trim() || null,
  };

  Object.assign(meal, updates);

  if (state.supabaseReady && !meal.id.startsWith('local-')) {
    await updateMealInCloud(meal.id, updates);
  }

  const dateStr = formatDate(state.currentDate);
  saveLocalMeals(dateStr, state.meals);

  closeEditModal();
  showToast('✅ 已更新');
  renderTodayTab();
}

async function deleteMeal() {
  if (!state.editingMealId) return;

  const meal = state.meals.find(m => m.id === state.editingMealId);
  if (!meal) return;

  if (state.supabaseReady && !meal.id.startsWith('local-')) {
    await deleteMealFromCloud(meal.id);
  }

  state.meals = state.meals.filter(m => m.id !== state.editingMealId);

  const dateStr = formatDate(state.currentDate);
  saveLocalMeals(dateStr, state.meals);

  closeEditModal();
  showToast('✅ 已删除');
  renderTodayTab();
}

// ============================
// 估算流程
// ============================
function resetEstimateUI() {
  state.estimationResult = null;
  state.currentImageBase64 = null;
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('uploadPlaceholder').style.display = 'block';
  document.getElementById('foodText').value = '';
  document.getElementById('photoInput').value = '';
}

function showLoading(text = '正在处理...') {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingCard').style.display = 'block';
  document.getElementById('resultCard').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loadingCard').style.display = 'none';
}

// ============================
// 语音输入
// ============================
let speechRecognition = null;
let isRecording = false;

function toggleVoiceInput() {
  if (isRecording) {
    stopVoiceInput();
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('当前浏览器不支持语音输入，请用 Chrome 或 Edge');
    return;
  }

  // 停止旧的
  if (speechRecognition) {
    try { speechRecognition.abort(); } catch (e) {}
  }

  speechRecognition = new SR();
  speechRecognition.lang = 'zh-CN';
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;

  const micBtn = document.getElementById('micBtn');
  const textarea = document.getElementById('foodText');
  let baseText = textarea.value;

  speechRecognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add('recording');
    micBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="9" y="4" width="6" height="12" rx="3" fill="#fff"/><path d="M19 11c0 3.86-3.14 7-7 7s-7-3.14-7-7H3c0 4.08 3.05 7.44 7 7.93V21h2v-2.07c3.95-.49 7-3.85 7-7.93h-2z" fill="#fff"/></svg>';
  };

  speechRecognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    if (final) {
      baseText += (baseText && !baseText.endsWith(' ') ? ' ' : '') + final;
    }
    textarea.value = baseText + (interim ? ' ' + interim : '');
    textarea.scrollTop = textarea.scrollHeight;
  };

  speechRecognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      showToast('请允许浏览器使用麦克风');
    } else if (event.error === 'no-speech') {
      // 静默处理
    } else {
      showToast('语音识别出错：' + event.error);
    }
  };

  speechRecognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.innerHTML = '<svg class="mic-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
  };

  try {
    speechRecognition.start();
  } catch (e) {
    console.warn('Failed to start speech recognition:', e);
    showToast('启动语音识别失败，请重试');
  }
}

function stopVoiceInput() {
  if (speechRecognition && isRecording) {
    try { speechRecognition.stop(); } catch (e) {}
  }
}

async function handleEstimate() {
  const text = document.getElementById('foodText').value.trim();
  const image = state.currentImageBase64;

  if (!image && !text) {
    showToast('请拍照或输入食物描述');
    return;
  }

  const config = getAIConfig();
  const visionConfig = getVisionAIConfig();
  const hasImage = !!image;
  const hasText = !!text;

  if (hasImage && !hasText && !visionConfig.apiKey) {
    showToast('拍照识别需要配置智谱 API Key，请在设置中配置');
    switchTab('settings');
    return;
  }
  if (!hasImage && !config.apiKey) {
    showToast('请先在设置中配置 DeepSeek API Key');
    switchTab('settings');
    return;
  }
  if (hasImage && hasText && !visionConfig.apiKey && !config.apiKey) {
    showToast('请先在设置中配置 AI API Key');
    switchTab('settings');
    return;
  }

  showLoading('正在估算热量...');
  document.getElementById('estimateBtn').disabled = true;

  try {
    const result = await estimateCalories(image, text);
    state.estimationResult = result;
    hideLoading();
    renderEstimateResult(result);
  } catch (e) {
    hideLoading();
    showToast('❌ ' + e.message);
  } finally {
    document.getElementById('estimateBtn').disabled = false;
  }
}

async function handleReEstimate() {
  const additionalText = document.getElementById('reEstimateText').value.trim();
  if (!additionalText) {
    showToast('请输入补充信息');
    return;
  }

  showLoading('正在重新估算...');
  document.getElementById('reEstimateBtn').disabled = true;

  try {
    const result = await reEstimate(state.estimationResult, additionalText, state.currentImageBase64);
    state.estimationResult = result;
    hideLoading();
    renderEstimateResult(result);
    document.getElementById('reEstimateText').value = '';
    showToast('✅ 已更新估算');
  } catch (e) {
    hideLoading();
    showToast('❌ ' + e.message);
  } finally {
    document.getElementById('reEstimateBtn').disabled = false;
  }
}

// ============================
// 今日分析
// ============================
async function handleGenerateAnalysis() {
  const config = getAIConfig();
  if (!config.apiKey) {
    showToast('请先在设置中配置 AI API Key');
    switchTab('settings');
    return;
  }

  const btn = document.getElementById('generateAnalysisBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> 分析中...';

  try {
    const analysis = await generateDailyAnalysis(state.meals);

    // 保存分析
    const dateStr = formatDate(state.currentDate);
    localStorage.setItem(`analysis_${state.roomCode}_${dateStr}`, JSON.stringify(analysis));

    // 显示
    document.getElementById('dailyAnalysisCard').style.display = 'block';
    renderAnalysis(analysis);
    btn.style.display = 'none';
    showToast('✅ 分析已生成');
  } catch (e) {
    showToast('❌ ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🤖</span> 生成今日分析';
  }
}

async function handleRefreshAnalysis() {
  // 删除旧分析并重新生成
  const dateStr = formatDate(state.currentDate);
  localStorage.removeItem(`analysis_${state.roomCode}_${dateStr}`);
  document.getElementById('dailyAnalysisCard').style.display = 'none';
  document.getElementById('generateAnalysisBtn').style.display = 'block';
  await handleGenerateAnalysis();
}

// ============================
// 报告生成
// ============================
async function handleGenerateReport() {
  const config = getAIConfig();
  if (!config.apiKey) {
    showToast('请先在设置中配置 AI API Key');
    switchTab('settings');
    return;
  }

  const type = state.currentReportType;
  const now = state.currentDate;
  let startDate, endDate;

  if (type === 'daily') {
    startDate = endDate = formatDate(now);
  } else if (type === 'weekly') {
    endDate = formatDate(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    startDate = formatDate(start);
  } else {
    endDate = formatDate(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    startDate = formatDate(start);
  }

  document.getElementById('reportLoading').style.display = 'block';
  document.getElementById('reportCard').style.display = 'none';
  document.getElementById('generateReportBtn').disabled = true;

  try {
    // 从云端加载范围数据
    let meals = [];
    if (state.supabaseReady) {
      meals = await loadMealsRangeFromCloud(startDate, endDate);
    }

    // 补充本地数据
    if (meals.length === 0) {
      // 从本地加载每天的记录
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const localMeals = getLocalMeals(formatDate(d));
        meals.push(...localMeals);
      }
    }

    if (meals.length === 0) {
      showToast('该时段暂无饮食记录');
      document.getElementById('reportLoading').style.display = 'none';
      return;
    }

    const report = await generateAIReport(type, meals);
    renderReport(report);
    showToast('✅ 报告已生成');
  } catch (e) {
    showToast('❌ ' + e.message);
  } finally {
    document.getElementById('reportLoading').style.display = 'none';
    document.getElementById('generateReportBtn').disabled = false;
  }
}

// ============================
// 日期导航
// ============================
async function changeDate(delta) {
  const newDate = new Date(state.currentDate);
  newDate.setDate(newDate.getDate() + delta);
  state.currentDate = newDate;
  updateDateDisplay();
  await loadMeals(state.currentDate);
  if (state.currentTab === 'today') renderTodayTab();
  if (state.currentTab === 'reports') renderReportsTab();
}

function goToToday() {
  state.currentDate = new Date();
  updateDateDisplay();
  loadMeals(state.currentDate).then(() => {
    if (state.currentTab === 'today') renderTodayTab();
    if (state.currentTab === 'reports') renderReportsTab();
  });
}

// ============================
// 日历弹窗逻辑
// ============================
let calViewMonth = new Date();  // 日历当前显示的月份

function openCalendar() {
  calViewMonth = new Date(state.currentDate);
  renderCalendar();
  document.getElementById('calendarOverlay').style.display = 'flex';
}

function closeCalendar() {
  document.getElementById('calendarOverlay').style.display = 'none';
}

function renderCalendar() {
  const year = calViewMonth.getFullYear();
  const month = calViewMonth.getMonth();
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  document.getElementById('calMonthLabel').textContent = `${year}年 ${monthNames[month]}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  // 上个月末几天
  const prevLastDay = new Date(year, month, 0).getDate();

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  // 前置补齐
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevLastDay - i;
    const btn = document.createElement('button');
    btn.className = 'cal-day other-month';
    btn.textContent = d;
    btn.onclick = () => { calViewMonth.setMonth(calViewMonth.getMonth() - 1); renderCalendar(); };
    grid.appendChild(btn);
  }

  // 当月
  const today = new Date();
  const selectedStr = formatDate(state.currentDate);
  for (let d = 1; d <= daysInMonth; d++) {
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = d;
    const thisDate = new Date(year, month, d);
    const thisStr = formatDate(thisDate);
    if (thisStr === formatDate(today)) btn.classList.add('today');
    if (thisStr === selectedStr) btn.classList.add('selected');
    btn.onclick = () => {
      state.currentDate = thisDate;
      updateDateDisplay();
      closeCalendar();
      loadMeals(state.currentDate).then(() => {
        if (state.currentTab === 'today') renderTodayTab();
        if (state.currentTab === 'reports') renderReportsTab();
      });
    };
    grid.appendChild(btn);
  }

  // 后置补齐到 42 格（6 行）
  const total = startWeekday + daysInMonth;
  const remaining = (7 - (total % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const btn = document.createElement('button');
    btn.className = 'cal-day other-month';
    btn.textContent = i;
    btn.onclick = () => { calViewMonth.setMonth(calViewMonth.getMonth() + 1); renderCalendar(); };
    grid.appendChild(btn);
  }
}

function updateDateDisplay() {
  document.getElementById('currentDate').textContent = formatDateDisplay(state.currentDate);
}

// ============================
// 用户档案管理
// ============================
const AVATAR_EMOJIS = ['👤','🧑','👩','👨','🧒','👵','👴','👮','👷','🧑‍🍳','🧑‍🌾','🧑‍⚕️','🦸','🦹','🧙','🧚','🧜','🧝'];

function getProfiles() {
  return state.profiles;
}

function saveProfiles() {
  localStorage.setItem('profiles', JSON.stringify(state.profiles));
}

function getCurrentProfile() {
  if (!state.currentProfileId) return null;
  return state.profiles.find(p => p.id === state.currentProfileId) || null;
}

function pickAvatarEmoji(name) {
  if (!name) return '👤';
  const code = name.charCodeAt(0) || 0;
  return AVATAR_EMOJIS[code % AVATAR_EMOJIS.length];
}

// Mifflin-St Jeor 公式估算基础代谢率 (BMR)
// 男: BMR = 10*weight + 6.25*height - 5*age + 5
// 女: BMR = 10*weight + 6.25*height - 5*age - 161
// 乘以活动系数 1.375 (轻度活动) 得到平均日消耗量
function estimateDailyBurn(profile) {
  if (!profile) return null;
  const { gender, height, weight, birthday } = profile;
  if (!height || !weight) return null;

  let age = 30;
  if (birthday) {
    const birth = new Date(birthday);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      if (age < 1 || age > 120) age = 30;
    }
  }

  const h = parseFloat(height);
  const w = parseFloat(weight);
  let bmr;
  if (gender === 'female') {
    bmr = 10 * w + 6.25 * h - 5 * age - 161;
  } else if (gender === 'male') {
    bmr = 10 * w + 6.25 * h - 5 * age + 5;
  } else {
    // 性别未知，取男女平均
    bmr = 10 * w + 6.25 * h - 5 * age + (5 - 161) / 2;
  }
  // 活动系数 1.375 (轻度活动：日常办公+少量运动)
  return Math.round(bmr * 1.375);
}

function getEffectiveDailyBurn() {
  const profile = getCurrentProfile();
  if (!profile) return null;
  // 用户手动填写优先
  if (profile.dailyBurn && profile.dailyBurn > 0) return profile.dailyBurn;
  // 自动估算
  return estimateDailyBurn(profile);
}

let editingProfileId = null; // null=新建, 非null=编辑

function showProfileForm(profileId) {
  editingProfileId = profileId || null;
  const form = document.getElementById('profileEditForm');
  const createBar = document.getElementById('profileCreateBar');
  const title = document.getElementById('profileFormTitle');
  const hint = document.getElementById('profileBurnHint');

  if (profileId) {
    const p = state.profiles.find(x => x.id === profileId);
    if (!p) return;
    title.textContent = '编辑档案';
    document.getElementById('profileName').value = p.name || '';
    document.getElementById('profileBirthday').value = p.birthday || '';
    document.getElementById('profileGender').value = p.gender || '';
    document.getElementById('profileHeight').value = p.height || '';
    document.getElementById('profileWeight').value = p.weight || '';
    document.getElementById('profileDailyBurn').value = p.dailyBurn || '';
  } else {
    title.textContent = '创建新档案';
    document.getElementById('profileName').value = '';
    document.getElementById('profileBirthday').value = '';
    document.getElementById('profileGender').value = '';
    document.getElementById('profileHeight').value = '';
    document.getElementById('profileWeight').value = '';
    document.getElementById('profileDailyBurn').value = '';
  }
  updateBurnHint();
  form.style.display = 'flex';
  createBar.style.display = 'none';
  document.getElementById('profileName').focus();
}

function hideProfileForm() {
  document.getElementById('profileEditForm').style.display = 'none';
  document.getElementById('profileCreateBar').style.display = 'flex';
}

function updateBurnHint() {
  const hint = document.getElementById('profileBurnHint');
  const dailyBurnInput = document.getElementById('profileDailyBurn');
  if (dailyBurnInput.value) {
    hint.textContent = '';
    return;
  }
  const tempProfile = {
    gender: document.getElementById('profileGender').value,
    height: parseFloat(document.getElementById('profileHeight').value) || null,
    weight: parseFloat(document.getElementById('profileWeight').value) || null,
    birthday: document.getElementById('profileBirthday').value,
  };
  const estimated = estimateDailyBurn(tempProfile);
  if (estimated) {
    hint.textContent = `根据信息估算约 ${estimated} kcal/天`;
  } else {
    hint.textContent = '填写身高体重后可自动估算';
  }
}

function saveProfileFromForm() {
  const name = document.getElementById('profileName').value.trim();
  if (!name) {
    showToast('请输入用户名');
    return;
  }
  if (name.length > 20) {
    showToast('用户名最多 20 字');
    return;
  }

  const profileData = {
    name: name,
    avatar: pickAvatarEmoji(name),
    birthday: document.getElementById('profileBirthday').value || null,
    gender: document.getElementById('profileGender').value || null,
    height: parseFloat(document.getElementById('profileHeight').value) || null,
    weight: parseFloat(document.getElementById('profileWeight').value) || null,
    dailyBurn: parseInt(document.getElementById('profileDailyBurn').value) || null,
  };

  if (editingProfileId) {
    // 编辑现有档案
    const p = state.profiles.find(x => x.id === editingProfileId);
    if (!p) return;
    Object.assign(p, profileData);
    saveProfiles();
    syncProfileToCloud(p);
    hideProfileForm();
    renderProfileList();
    updateUserDisplay();
    // 重新渲染今日页面（更新热量对比）
    renderTodayTab();
    showToast(`✅ 已更新档案：${name}`);
  } else {
    // 新建
    const exists = state.profiles.find(p => p.name === name);
    if (exists) {
      switchProfile(exists.id);
      return;
    }
    const profile = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      ...profileData,
    };
    state.profiles.push(profile);
    saveProfiles();
    syncProfileToCloud(profile);
    hideProfileForm();
    switchProfile(profile.id);
    showToast(`✅ 已创建档案：${name}`);
  }
}

function switchProfile(profileId) {
  const profile = state.profiles.find(p => p.id === profileId);
  if (!profile) return;
  state.currentProfileId = profileId;
  state.roomCode = profileId;  // 数据隔离 key = profileId
  localStorage.setItem('currentProfileId', profileId);
  localStorage.setItem('roomCode', profileId);
  updateUserDisplay();
  closeProfileOverlay();
  // 重新加载该用户的数据
  loadMeals(state.currentDate).then(() => {
    if (state.currentTab === 'today') renderTodayTab();
    if (state.currentTab === 'reports') renderReportsTab();
  });
  showToast(`已切换到：${profile.name}`);
}

function deleteProfile(profileId) {
  const profile = state.profiles.find(p => p.id === profileId);
  if (!profile) return;
  if (!confirm(`确定删除档案「${profile.name}」？\n该用户的所有本地记录将被清除，云端记录保留。`)) return;
  // 删除本地数据
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes(`_${profileId}_`)) keysToDelete.push(k);
  }
  keysToDelete.forEach(k => localStorage.removeItem(k));
  // 从 profiles 中移除
  state.profiles = state.profiles.filter(p => p.id !== profileId);
  saveProfiles();
  deleteProfileFromCloud(profileId);
  // 如果删的是当前用户，切到第一个或清空
  if (state.currentProfileId === profileId) {
    if (state.profiles.length > 0) {
      switchProfile(state.profiles[0].id);
    } else {
      state.currentProfileId = null;
      state.roomCode = 'default';
      localStorage.removeItem('currentProfileId');
      localStorage.setItem('roomCode', 'default');
      updateUserDisplay();
      loadMeals(state.currentDate).then(() => {
        if (state.currentTab === 'today') renderTodayTab();
        if (state.currentTab === 'reports') renderReportsTab();
      });
      renderProfileList();
    }
  } else {
    renderProfileList();
  }
  showToast('档案已删除');
}

function updateUserDisplay() {
  const profile = getCurrentProfile();
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userNameDisplay');
  if (profile) {
    avatarEl.textContent = profile.avatar || pickAvatarEmoji(profile.name);
    nameEl.textContent = profile.name;
  } else {
    avatarEl.textContent = '👤';
    nameEl.textContent = '点击选择';
  }
}

function openProfileOverlay() {
  renderProfileList();
  hideProfileForm();
  document.getElementById('profileOverlay').style.display = 'flex';
}

function closeProfileOverlay() {
  document.getElementById('profileOverlay').style.display = 'none';
}

function renderProfileList() {
  const list = document.getElementById('profileList');
  const profiles = getProfiles();
  if (profiles.length === 0) {
    list.innerHTML = '<div class="profile-empty">还没有档案<br>在下方创建第一个用户档案吧</div>';
    return;
  }
  list.innerHTML = profiles.map(p => {
    const isActive = p.id === state.currentProfileId;
    const date = new Date(p.createdAt);
    const dateStr = `${date.getMonth()+1}月${date.getDate()}日创建`;
    // 基本信息摘要
    let metaParts = [dateStr];
    if (p.gender) metaParts.push(p.gender === 'male' ? '男' : '女');
    if (p.height) metaParts.push(p.height + 'cm');
    if (p.weight) metaParts.push(p.weight + 'kg');
    const burn = p.dailyBurn || estimateDailyBurn(p);
    if (burn) metaParts.push(`日耗~${burn}kcal`);
    return `
      <div class="profile-item ${isActive ? 'active' : ''}" data-id="${p.id}">
        <div class="profile-item-left" onclick="switchProfile('${p.id}')">
          <div class="profile-item-avatar">${p.avatar || pickAvatarEmoji(p.name)}</div>
          <div>
            <div class="profile-item-name">${escapeHtml(p.name)}${isActive ? ' ✓' : ''}</div>
            <div class="profile-item-meta">${metaParts.join(' · ')}</div>
          </div>
        </div>
        <div class="profile-item-actions">
          <button onclick="showProfileForm('${p.id}')" title="编辑">✏️</button>
          <button class="delete" onclick="deleteProfile('${p.id}')" title="删除">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

function ensureProfileSelected() {
  if (!state.currentProfileId || !getCurrentProfile()) {
    // 自动选第一个或弹出选择
    if (state.profiles.length > 0) {
      switchProfile(state.profiles[0].id);
    } else {
      openProfileOverlay();
    }
  }
}

// ============================
// 设置
// ============================
function saveAIConfig() {
  const config = {
    baseUrl: document.getElementById('aiBaseUrl').value.trim(),
    apiKey: document.getElementById('aiApiKey').value.trim(),
    model: document.getElementById('aiModel').value.trim(),
  };
  state.aiConfig = config;
  localStorage.setItem('aiConfig', JSON.stringify(config));
  showToast('✅ AI 配置已保存');
}

async function testAIConnection() {
  const config = {
    baseUrl: document.getElementById('aiBaseUrl').value.trim(),
    apiKey: document.getElementById('aiApiKey').value.trim(),
    model: document.getElementById('aiModel').value.trim(),
  };

  if (!config.apiKey) {
    showToast('请先输入 API Key');
    return;
  }

  const resultDiv = document.getElementById('testResult');
  resultDiv.style.display = 'block';
  resultDiv.className = 'test-result';
  resultDiv.textContent = '测试中...';

  // 临时设置配置
  const oldConfig = state.aiConfig;
  state.aiConfig = config;

  try {
    const reply = await callAI(
      [{ role: 'user', content: '请回复"连接成功"四个字' }],
      { temperature: 0, max_tokens: 20 }
    );
    resultDiv.className = 'test-result success';
    resultDiv.textContent = `✅ 连接成功：${reply.trim()}`;
  } catch (e) {
    resultDiv.className = 'test-result error';
    resultDiv.textContent = `❌ 连接失败：${e.message}`;
    state.aiConfig = oldConfig;
  }
}

function applyPreset(presetKey) {
  const preset = AI_PRESETS[presetKey];
  if (!preset) return;
  document.getElementById('aiBaseUrl').value = preset.baseUrl;
  document.getElementById('aiModel').value = preset.model;
  showToast(`已切换到 ${presetKey} 预设，请输入 API Key`);
}

// ============================
// 视觉模型配置（智谱 GLM-4V）
// ============================
function saveVisionAIConfig() {
  const config = {
    baseUrl: document.getElementById('aiVisionBaseUrl').value.trim(),
    apiKey: document.getElementById('aiVisionApiKey').value.trim(),
    model: document.getElementById('aiVisionModel').value.trim(),
  };
  state.aiConfigVision = config;
  localStorage.setItem('aiConfigVision', JSON.stringify(config));
  showToast('✅ 视觉模型配置已保存');
}

async function testVisionAIConnection() {
  const config = {
    baseUrl: document.getElementById('aiVisionBaseUrl').value.trim(),
    apiKey: document.getElementById('aiVisionApiKey').value.trim(),
    model: document.getElementById('aiVisionModel').value.trim(),
  };

  if (!config.apiKey) {
    showToast('请先输入智谱 API Key');
    return;
  }

  const resultDiv = document.getElementById('testVisionResult');
  resultDiv.style.display = 'block';
  resultDiv.className = 'test-result';
  resultDiv.textContent = '测试中...';

  try {
    const reply = await callAI(
      [{ role: 'user', content: '请回复"连接成功"四个字' }],
      { temperature: 0, max_tokens: 20 },
      config
    );
    resultDiv.className = 'test-result success';
    resultDiv.textContent = `✅ 连接成功：${reply.trim()}`;
  } catch (e) {
    resultDiv.className = 'test-result error';
    resultDiv.textContent = `❌ 连接失败：${e.message}`;
  }
}

function applyVisionPreset(presetKey) {
  const preset = AI_PRESETS[presetKey];
  if (!preset) return;
  document.getElementById('aiVisionBaseUrl').value = preset.baseUrl;
  document.getElementById('aiVisionModel').value = preset.model;
  showToast(`已切换到 ${presetKey} 预设，请输入 API Key`);
}

function saveRoomCode() {
  const code = document.getElementById('roomCodeInput').value.trim() || 'default';
  state.roomCode = code;
  localStorage.setItem('roomCode', code);
  showToast('✅ 房间码已保存');
  // 重新加载数据
  loadMeals(state.currentDate).then(() => {
    if (state.currentTab === 'today') renderTodayTab();
  });
}

async function recheckDb() {
  const ready = await checkSupabaseTables();
  state.supabaseReady = ready;
  renderSettingsTab();
  if (ready) {
    showToast('✅ 数据库已就绪');
    await loadMeals(state.currentDate);
  } else {
    showToast('⚠️ 数据库仍未就绪，请先执行 SQL');
  }
}

// ============================
// 事件绑定
// ============================
function bindEvents() {
  // 标签切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 日期导航
  document.getElementById('prevDay').addEventListener('click', () => changeDate(-1));
  document.getElementById('nextDay').addEventListener('click', () => changeDate(1));
  document.getElementById('todayBtn').addEventListener('click', goToToday);
  document.getElementById('currentDateBtn').addEventListener('click', openCalendar);
  document.getElementById('calPrevMonth').addEventListener('click', () => {
    calViewMonth.setMonth(calViewMonth.getMonth() - 1); renderCalendar();
  });
  document.getElementById('calNextMonth').addEventListener('click', () => {
    calViewMonth.setMonth(calViewMonth.getMonth() + 1); renderCalendar();
  });
  document.getElementById('calToday').addEventListener('click', () => {
    calViewMonth = new Date();
    state.currentDate = new Date();
    updateDateDisplay();
    renderCalendar();
    loadMeals(state.currentDate).then(() => {
      if (state.currentTab === 'today') renderTodayTab();
      if (state.currentTab === 'reports') renderReportsTab();
    });
  });
  document.getElementById('calClose').addEventListener('click', closeCalendar);
  document.getElementById('calendarOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'calendarOverlay') closeCalendar();
  });

  // 用户档案
  document.getElementById('userProfileBtn').addEventListener('click', openProfileOverlay);
  document.getElementById('profileCloseBtn').addEventListener('click', closeProfileOverlay);
  document.getElementById('profileOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'profileOverlay') closeProfileOverlay();
  });
  document.getElementById('createProfileBtn').addEventListener('click', () => {
    showProfileForm(null);
  });
  document.getElementById('profileSaveBtn').addEventListener('click', saveProfileFromForm);
  document.getElementById('profileCancelBtn').addEventListener('click', hideProfileForm);
  document.getElementById('profileName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveProfileFromForm();
  });
  // 实时更新日消耗量估算提示
  ['profileGender', 'profileHeight', 'profileWeight', 'profileBirthday'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateBurnHint);
    document.getElementById(id).addEventListener('change', updateBurnHint);
  });

  // 图片上传
  const uploadArea = document.getElementById('uploadArea');
  const photoInput = document.getElementById('photoInput');

  uploadArea.addEventListener('click', () => photoInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  });

  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
  });

  document.getElementById('removePhoto').addEventListener('click', (e) => {
    e.stopPropagation();
    state.currentImageBase64 = null;
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    photoInput.value = '';
  });

  // 估算
  document.getElementById('estimateBtn').addEventListener('click', handleEstimate);
  document.getElementById('reEstimateBtn').addEventListener('click', handleReEstimate);
  document.getElementById('recordBtn').addEventListener('click', openMealTypeModal);

  // 语音输入
  document.getElementById('micBtn').addEventListener('click', toggleVoiceInput);

  // 小猫观察：点击小猫头像触发对话，刷新按钮强制重新生成
  document.getElementById('catAvatar').addEventListener('click', onCatAvatarClick);
  document.getElementById('catAvatar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCatAvatarClick(); }
  });
  document.getElementById('catRefreshBtn').addEventListener('click', refreshCatObservation);

  // 手动输入
  document.getElementById('manualEntryBtn').addEventListener('click', openManualModal);
  document.getElementById('manualSaveBtn').addEventListener('click', saveManualEntry);
  document.getElementById('closeManualModal').addEventListener('click', closeManualModal);

  // 弹窗关闭
  document.getElementById('closeMealModal').addEventListener('click', closeMealTypeModal);
  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);

  // 点击遮罩关闭弹窗
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        state.editingMealId = null;
      }
    });
  });

  // 编辑
  document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
  document.getElementById('deleteMealBtn').addEventListener('click', deleteMeal);

  // 今日分析
  document.getElementById('generateAnalysisBtn').addEventListener('click', handleGenerateAnalysis);
  document.getElementById('refreshAnalysis').addEventListener('click', handleRefreshAnalysis);

  // 报告
  document.querySelectorAll('.report-type').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-type').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentReportType = btn.dataset.report;
      renderReportsTab();
    });
  });
  document.getElementById('generateReportBtn').addEventListener('click', handleGenerateReport);

  // 设置 - 文字模型
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });
  document.getElementById('saveAiBtn').addEventListener('click', saveAIConfig);
  document.getElementById('testAiBtn').addEventListener('click', testAIConnection);
  // 设置 - 视觉模型
  document.querySelectorAll('[data-preset-vision]').forEach(btn => {
    btn.addEventListener('click', () => applyVisionPreset(btn.dataset.presetVision));
  });
  document.getElementById('saveVisionAiBtn').addEventListener('click', saveVisionAIConfig);
  document.getElementById('testVisionAiBtn').addEventListener('click', testVisionAIConnection);
  document.getElementById('saveRoomBtn').addEventListener('click', saveRoomCode);
  document.getElementById('recheckDbBtn').addEventListener('click', recheckDb);
  document.getElementById('copySqlBtn').addEventListener('click', () => {
    const sql = document.getElementById('sqlContent').textContent;
    navigator.clipboard.writeText(sql).then(() => {
      showToast('✅ SQL 已复制到剪贴板');
    }).catch(() => {
      showToast('复制失败，请手动选择复制');
    });
  });
}

// ============================
// 图片文件处理
// ============================
async function handleImageFile(file) {
  try {
    const base64 = await compressImage(file);
    state.currentImageBase64 = base64;
    document.getElementById('previewImg').src = base64;
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').style.display = 'block';
  } catch (e) {
    showToast('图片处理失败');
  }
}

// ============================
// 初始化
// ============================
async function init() {
  initSupabase();
  bindEvents();
  updateDateDisplay();

  // 用户档案初始化
  updateUserDisplay();

  // 检查 Supabase 表
  state.supabaseReady = await checkSupabaseTables();

  // 从云端加载档案，与本地合并
  if (state.supabaseReady) {
    const cloudProfiles = await loadProfilesFromCloud();
    const localIds = new Set(state.profiles.map(p => p.id));
    for (const cp of cloudProfiles) {
      if (!localIds.has(cp.id)) {
        state.profiles.push(cp);
      }
    }
    saveProfiles();
    updateUserDisplay();
  }

  // 加载今日数据
  await loadMeals(state.currentDate);

  // 渲染初始页面
  renderTodayTab();
  renderReportsTab();

  // 如果没有档案，弹出选择/创建档案
  ensureProfileSelected();

  // 自动检查 AI 配置
  const config = getAIConfig();
  if (!config.apiKey) {
    setTimeout(() => {
      showToast('💡 请先在设置中配置 AI API Key', 4000);
    }, 1000);
  }
}

// 启动
document.addEventListener('DOMContentLoaded', init);

// 暴露给全局（用于 onclick）
window.openEditModal = openEditModal;
window.switchProfile = switchProfile;
window.deleteProfile = deleteProfile;
window.showProfileForm = showProfileForm;
window.refreshCatObservation = refreshCatObservation;
window.onCatAvatarClick = onCatAvatarClick;
