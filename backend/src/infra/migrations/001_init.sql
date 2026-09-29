-- ============================================================
-- 智行 Robotaxi · 车内交互终端 · 初始化迁移
-- 场景：乘客已上车，面对的是一块横屏车机
--
-- 约定：
--   1) 主键统一 INTEGER PRIMARY KEY AUTOINCREMENT（车辆/POI 用业务字符串主键）
--   2) 时间统一存 Unix 毫秒（INTEGER）
--   3) 所有金额单位为「分」，避免浮点误差
--   4) 表按业务域分组，跨域禁止直接联表
--   5) 本方案不含登录/账户体系：车机是公共设备，只做「行程会话」
-- ============================================================

-- ---------- 乘客与偏好（只读引用，不做注册登录） ----------
CREATE TABLE IF NOT EXISTS t_user (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT    NOT NULL UNIQUE,
  nickname    TEXT    NOT NULL,
  avatar      TEXT,
  member_tier TEXT    NOT NULL DEFAULT 'STANDARD',
  created_at  INTEGER NOT NULL
);

-- 乘客偏好：行程开始时自动应用到座舱
CREATE TABLE IF NOT EXISTS t_user_preference (
  user_id       INTEGER PRIMARY KEY,
  temperature   INTEGER NOT NULL DEFAULT 24,
  music_style   TEXT    NOT NULL DEFAULT 'light',
  quiet_mode    INTEGER NOT NULL DEFAULT 1,
  ambient_light TEXT    NOT NULL DEFAULT 'warm',
  seat_heat     INTEGER NOT NULL DEFAULT 0
);

-- ---------- fleet 域 ----------
CREATE TABLE IF NOT EXISTS t_vehicle_model (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  tagline    TEXT NOT NULL,
  seats      INTEGER NOT NULL,
  accent     TEXT NOT NULL,
  features   TEXT NOT NULL   -- JSON 数组
);

CREATE TABLE IF NOT EXISTS t_vehicle (
  id            TEXT PRIMARY KEY,
  plate_no      TEXT    NOT NULL,
  cabin_no      TEXT    NOT NULL,            -- 车内编号，欢迎页用于核对
  model_code    TEXT    NOT NULL,
  battery       INTEGER NOT NULL DEFAULT 100,
  status        TEXT    NOT NULL DEFAULT 'IDLE',
  lng           REAL    NOT NULL,
  lat           REAL    NOT NULL,
  heading       REAL    NOT NULL DEFAULT 0,
  speed_kph     REAL    NOT NULL DEFAULT 0,
  road_name     TEXT    NOT NULL DEFAULT '',  -- 当前所在道路（状态透明化）
  edge_id       TEXT,
  edge_progress REAL    NOT NULL DEFAULT 0,
  edge_dir      INTEGER NOT NULL DEFAULT 1,
  current_ride_id INTEGER,
  odometer_m    INTEGER NOT NULL DEFAULT 0,
  camera_on     INTEGER NOT NULL DEFAULT 1,
  mic_on        INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vehicle_status ON t_vehicle(status);

CREATE TABLE IF NOT EXISTS t_poi (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  aliases  TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  node_id  TEXT,
  lng      REAL NOT NULL,
  lat      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poi_category ON t_poi(category);

-- ---------- ride 域：一段行程的全生命周期 ----------
-- 状态机：PENDING(待上车) → ABOARD(已上车待校验) → READY(校验通过待出发)
--        → ONGOING(行程中) → ARRIVING(即将到达) → ARRIVED(已停稳)
--        → COMPLETED(已结束) ；旁支 CANCELLED
CREATE TABLE IF NOT EXISTS t_ride (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_no          TEXT    NOT NULL UNIQUE,
  user_id          INTEGER NOT NULL,
  vehicle_id       TEXT    NOT NULL,
  model_code       TEXT    NOT NULL,
  status           TEXT    NOT NULL,
  origin_name      TEXT    NOT NULL,
  origin_lng       REAL    NOT NULL,
  origin_lat       REAL    NOT NULL,
  dest_name        TEXT    NOT NULL,
  dest_lng         REAL    NOT NULL,
  dest_lat         REAL    NOT NULL,
  dest_category    TEXT    NOT NULL DEFAULT 'other',
  passengers       INTEGER NOT NULL DEFAULT 1,
  verify_code      TEXT    NOT NULL,             -- 乘客手机号后 4 位，用于上车校验
  plan_distance_m  INTEGER NOT NULL DEFAULT 0,
  plan_duration_s  INTEGER NOT NULL DEFAULT 0,
  traveled_m       INTEGER NOT NULL DEFAULT 0,
  fare_total       INTEGER NOT NULL DEFAULT 0,   -- 预估总费用（分）
  fare_discount    INTEGER NOT NULL DEFAULT 0,
  fare_base        INTEGER NOT NULL DEFAULT 0,   -- 起步价
  fare_distance    INTEGER NOT NULL DEFAULT 0,   -- 里程费
  fare_time        INTEGER NOT NULL DEFAULT 0,   -- 时长费
  co2_saved_g      INTEGER NOT NULL DEFAULT 0,
  rating_score     INTEGER,
  created_at       INTEGER NOT NULL,
  aboard_at        INTEGER,
  started_at       INTEGER,
  arriving_at      INTEGER,
  arrived_at       INTEGER,
  ended_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ride_status ON t_ride(status);
CREATE INDEX IF NOT EXISTS idx_ride_vehicle ON t_ride(vehicle_id, status);

-- 行驶轨迹（用于地图回放与行程小结）
CREATE TABLE IF NOT EXISTS t_ride_route (
  ride_id INTEGER NOT NULL,
  seq     INTEGER NOT NULL,
  lng     REAL    NOT NULL,
  lat     REAL    NOT NULL,
  speed   REAL    NOT NULL DEFAULT 0,
  ts      INTEGER NOT NULL,
  PRIMARY KEY (ride_id, seq)
);

-- 行程事件流：状态变更 + 车辆行为（决策可视化的数据源）
CREATE TABLE IF NOT EXISTS t_ride_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL,   -- STATUS | BEHAVIOR | CABIN | SAFETY | SYSTEM
  type       TEXT    NOT NULL,   -- 具体类型，如 YIELD_PEDESTRIAN
  title      TEXT    NOT NULL DEFAULT '',
  detail     TEXT    NOT NULL DEFAULT '',
  icon       TEXT    NOT NULL DEFAULT '',
  payload    TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_event_ride ON t_ride_event(ride_id, id DESC);

-- ---------- 会话域：车机与当前行程的绑定 ----------
-- 车机是公共设备，无登录；行程结束时会话失效，个人数据清除
CREATE TABLE IF NOT EXISTS t_ride_session (
  token      TEXT PRIMARY KEY,
  ride_id    INTEGER NOT NULL,
  vehicle_id TEXT    NOT NULL,
  user_id    INTEGER,
  status     TEXT    NOT NULL DEFAULT 'PENDING', -- PENDING(未校验) | ACTIVE(已校验) | ENDED
  verified_at INTEGER,
  ended_at   INTEGER,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

-- ---------- cabin 域：座舱环境 ----------
CREATE TABLE IF NOT EXISTS t_cabin_setting (
  vehicle_id    TEXT PRIMARY KEY,
  temp_left     REAL    NOT NULL DEFAULT 24,
  temp_right    REAL    NOT NULL DEFAULT 24,
  fan_level     INTEGER NOT NULL DEFAULT 2,
  seat_heat     INTEGER NOT NULL DEFAULT 0,
  seat_vent     INTEGER NOT NULL DEFAULT 0,
  ambient_light TEXT    NOT NULL DEFAULT 'warm',
  brightness    INTEGER NOT NULL DEFAULT 60,
  volume        INTEGER NOT NULL DEFAULT 30,
  curtain       INTEGER NOT NULL DEFAULT 0,
  scene         TEXT    NOT NULL DEFAULT 'standard',
  updated_at    INTEGER NOT NULL
);

-- 座舱控制指令记录（用于遥测与 /ops 演示；真实车机是要下发到车控总线的）
CREATE TABLE IF NOT EXISTS t_vehicle_command (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id TEXT    NOT NULL,
  ride_id    INTEGER,
  target     TEXT    NOT NULL,   -- cabin | door | stop | light
  action     TEXT    NOT NULL,
  value      TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'DONE',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cmd_vehicle ON t_vehicle_command(vehicle_id, id DESC);

-- ---------- stop 域：停靠请求（普通 / 紧急） ----------
CREATE TABLE IF NOT EXISTS t_stop_request (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id     INTEGER NOT NULL,
  kind        TEXT    NOT NULL,   -- NORMAL(前方下车) | EMERGENCY(紧急停车)
  target_name TEXT    NOT NULL DEFAULT '',
  target_lng  REAL,
  target_lat  REAL,
  note        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'PENDING', -- PENDING | ACCEPTED | DONE | CANCELLED
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stop_ride ON t_stop_request(ride_id, id DESC);

-- ---------- help 域：远程协助与安全 ----------
CREATE TABLE IF NOT EXISTS t_assist_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL,
  agent_name TEXT    NOT NULL,
  agent_avatar TEXT  NOT NULL DEFAULT '',
  topic      TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'ACTIVE',
  created_at INTEGER NOT NULL,
  ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS t_assist_message (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role       TEXT    NOT NULL,   -- USER | AGENT | SYSTEM
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assist_msg ON t_assist_message(session_id, id);

CREATE TABLE IF NOT EXISTS t_sos_record (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL,
  user_id    INTEGER,
  reason     TEXT    NOT NULL DEFAULT '',
  status     TEXT    NOT NULL DEFAULT 'HANDLING',
  created_at INTEGER NOT NULL
);

-- 把行程同步到手机（车内不分享，只做扫码带走）
CREATE TABLE IF NOT EXISTS t_share_link (
  token      TEXT PRIMARY KEY,
  ride_id    INTEGER NOT NULL,
  expire_at  INTEGER NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ---------- fare 域：账单（车内只读展示，不收款） ----------
CREATE TABLE IF NOT EXISTS t_fare (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id      INTEGER NOT NULL UNIQUE,
  base_fare    INTEGER NOT NULL DEFAULT 0,
  distance_fare INTEGER NOT NULL DEFAULT 0,
  time_fare    INTEGER NOT NULL DEFAULT 0,
  discount     INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  paid_channel TEXT    NOT NULL DEFAULT 'APP',
  paid         INTEGER NOT NULL DEFAULT 1,
  paid_at      INTEGER
);

-- ---------- 评价（车内只做星级 + 标签，不做文本输入） ----------
CREATE TABLE IF NOT EXISTS t_rating (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL UNIQUE,
  score      INTEGER NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
