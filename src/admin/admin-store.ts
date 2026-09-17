import { getSupabase } from '../lib/supabase';

const db = () => getSupabase();

export type AdminReport = {
  id: string;
  reporter_id: string;
  reporter_label: string;
  target_type: string;
  target_id: string;
  target_label: string;
  target_excerpt: string;
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  action: 'none' | 'hide' | 'unhide' | 'dismiss';
  resolution_note: string;
  created_at: string;
  updated_at: string;
};

export type AdminReferralReview = {
  claim_id: string;
  submitted_at: string;
  referred_profile: string;
  referrer_profile: string;
  risk_flags: string[];
  email_verified: boolean;
  profile_created: boolean;
  activity_categories: string[];
  activity_span_hours: number | null;
  review_note: string;
};

export type AdminSignupAbuseWindow = {
  first_seen: string;
  last_seen: string;
  account_creations: number;
  blocked_attempts: number;
  signals: string[];
};

export async function adminSignupAbuse(): Promise<AdminSignupAbuseWindow[]> {
  const { data, error } = await db().rpc('admin_list_hexicoin_signup_abuse');
  if (error) throw error;
  return (data || []) as AdminSignupAbuseWindow[];
}

export async function adminReferralReviews(): Promise<AdminReferralReview[]> {
  const { data, error } = await db().rpc('admin_list_hexicoin_referral_reviews');
  if (error) throw error;
  return (data || []) as AdminReferralReview[];
}

export async function decideReferralReview(claimId: string, decision: 'approve' | 'reject', note: string): Promise<string> {
  const { data, error } = await db().rpc('admin_decide_hexicoin_referral', { p_claim: claimId, p_decision: decision, p_note: note });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('The referral review was not recorded.');
  return data;
}

export async function adminReports(): Promise<AdminReport[]> {
  const { data, error } = await db().rpc('admin_list_reports');
  if (error) throw error;
  return (data || []) as AdminReport[];
}

export async function updateReportStatus(reportId: string, status: AdminReport['status']): Promise<void> {
  const { data, error } = await db().rpc('admin_update_report_status', { report_id: reportId, next_status: status });
  if (error) throw error;
  if (!data) throw new Error('The report was not changed.');
}

export async function moderateReport(reportId: string, decision: Exclude<AdminReport['action'], 'none'>, note = ''): Promise<void> {
  const { data, error } = await db().rpc('admin_moderate_report', { report_id: reportId, decision, note });
  if (error) throw error;
  if (!data) throw new Error('The moderation action was not applied.');
}

export async function purgeModerationData(): Promise<number> {
  const { data, error } = await db().rpc('admin_purge_moderation_data', { retention_days: 180 });
  if (error) throw error;
  return Number(data || 0);
}
