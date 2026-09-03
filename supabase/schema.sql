-- 日食迹 - 热量管理工作台 数据库 Schema
-- 在 Supabase SQL Editor 中执行此文件

-- ============================
-- meals 表：饮食记录
-- ============================
CREATE TABLE IF NOT EXISTS public.meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT DEFAULT 'default',
  food_name TEXT NOT NULL,
  portion TEXT,
  calories INTEGER NOT NULL DEFAULT 0,
  calorie_min INTEGER,
  calorie_max INTEGER,
  confidence TEXT,
  error_sources TEXT,
  meal_type TEXT NOT NULL DEFAULT 'other',
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  record_time TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  image_data TEXT,
  ai_response JSONB,
  input_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_meals_room_code ON public.meals(room_code);
CREATE INDEX IF NOT EXISTS idx_meals_record_date ON public.meals(record_date);
CREATE INDEX IF NOT EXISTS idx_meals_meal_type ON public.meals(meal_type);

-- ============================
-- RLS 策略
-- ============================
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- 允许所有访问（anon key 友好）
DROP POLICY IF EXISTS "Allow all access to meals" ON public.meals;
CREATE POLICY "Allow all access to meals" ON public.meals
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================
-- profiles 表：用户档案（跨设备同步）
-- ============================
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  birthday TEXT,
  gender TEXT,
  height REAL,
  weight REAL,
  daily_burn INTEGER
);

-- 兼容已创建的表：添加新列
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height REAL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight REAL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_burn INTEGER;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to profiles" ON public.profiles;
CREATE POLICY "Allow all access to profiles" ON public.profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================
-- 自动更新 updated_at
-- ============================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meals_updated_at ON public.meals;
CREATE TRIGGER meals_updated_at
  BEFORE UPDATE ON public.meals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
