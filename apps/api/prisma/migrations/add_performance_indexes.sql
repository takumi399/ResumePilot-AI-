-- ============================================================================
-- [FIXED #14] 性能索引补充
-- ============================================================================
-- 解决 Dashboard 查询和 Worker 拉取作业时的全表扫描问题
-- ============================================================================

-- 1. Dashboard "用户最近分析" 查询
-- 查询模式: SELECT ... FROM analysis_results WHERE user_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 20
CREATE INDEX IF NOT EXISTS idx_analysis_user_completed
  ON analysis_results (user_id, status, created_at DESC)
  WHERE status = 'completed';

-- 2. Worker 拉取待处理的分析作业
-- 查询模式: SELECT ... FROM analysis_results WHERE status IN ('queued', 'processing') ORDER BY created_at ASC LIMIT 10
CREATE INDEX IF NOT EXISTS idx_analysis_status_created
  ON analysis_results (status, created_at)
  WHERE status IN ('queued', 'processing');

-- 3. 软删除简历的高效查询 (回收站)
-- 查询模式: SELECT ... FROM resumes WHERE deleted_at IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_resumes_purge
  ON resumes (scheduled_purge_at)
  WHERE deleted_at IS NOT NULL AND scheduled_purge_at IS NOT NULL;

-- 4. 用户会话清理 (Cron Job)
-- 查询模式: DELETE FROM user_sessions WHERE revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '30 days'
CREATE INDEX IF NOT EXISTS idx_sessions_revoked_cleanup
  ON user_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;
