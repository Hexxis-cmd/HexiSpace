import { getSupabase } from '../lib/supabase';
import { adminReferralReviews, adminReports, adminSignupAbuse, decideReferralReview, moderateReport, purgeModerationData, updateReportStatus, type AdminReport, type AdminReferralReview, type AdminSignupAbuseWindow } from './admin-store';
import '../styles.css';
import './admin-layout.css';

const root = document.querySelector<HTMLElement>('#admin-root');
const db = getSupabase();
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));

function draw(message = ''): void {
  if (!root) return;
  root.innerHTML = `<main class="admin-console"><p class="eyebrow">LOCAL OWNER TOOL</p><h1>Moderation console</h1><p class="muted">Reports and referral reviews are visible only to a user you explicitly add to <code>platform_admins</code>. Hiding is reversible; deletion is not automatic.</p><div id="admin-status" class="notice">${esc(message)}</div><div id="admin-actions"><button class="primary-button" id="admin-sign-in">Sign in with Google</button></div><section><h2>Signup activity</h2><p class="muted">Unusual network signup patterns, shown as time windows and counts only. No address or account identity is shown.</p><div id="signup-abuse-list" class="admin-report-list"><p class="muted">Sign in to load signup activity.</p></div></section><section><h2>Referral review</h2><p class="muted">Shared browser or network signals are review flags, not proof of abuse. This view shows activity categories and timing, never activity text.</p><div id="referral-review-list" class="admin-report-list"><p class="muted">Sign in to load referral reviews.</p></div></section><section><h2>Reports</h2><div id="report-list" class="admin-report-list"><p class="muted">Sign in to load reports.</p></div></section></main>`;
}

async function loadSignupAbuse(): Promise<void> {
  const list = document.querySelector<HTMLElement>('#signup-abuse-list');
  if (!list) return;
  try {
    const windows = await adminSignupAbuse();
    list.innerHTML = windows.length ? windows.map(signupAbuseCard).join('') : '<p class="muted">No unusual signup bursts in the last 30 days.</p>';
  } catch (error) {
    list.innerHTML = `<p class="muted">${esc(error instanceof Error ? error.message : 'Signup activity is unavailable.')}</p>`;
  }
}

function signupAbuseCard(window: AdminSignupAbuseWindow): string {
  const signals = window.signals.map((signal) => esc(signal.replaceAll('_', ' '))).join(', ');
  return `<article class="admin-report"><div><strong>Signup pattern · ${esc(new Date(window.first_seen).toLocaleDateString())}</strong><small>${esc(new Date(window.first_seen).toLocaleString())} – ${esc(new Date(window.last_seen).toLocaleString())}</small><p>${window.account_creations} account${window.account_creations === 1 ? '' : 's'} created · ${window.blocked_attempts} attempt${window.blocked_attempts === 1 ? '' : 's'} blocked</p><p>Signals: ${signals}</p></div></article>`;
}

async function loadReferralReviews(): Promise<void> {
  const list = document.querySelector<HTMLElement>('#referral-review-list');
  if (!list) return;
  try {
    const claims = await adminReferralReviews();
    list.innerHTML = claims.length ? claims.map(referralCard).join('') : '<p class="muted">No referrals need review.</p>';
    list.querySelectorAll<HTMLButtonElement>('[data-referral-decision]').forEach((button) => button.addEventListener('click', async () => {
      const decision = button.dataset.referralDecision as 'approve' | 'reject';
      const note = window.prompt(`Short reason to ${decision} this referral (at least 5 characters):`) || '';
      if (note.trim().length < 5) return;
      if (!window.confirm(`${decision === 'approve' ? 'Approve' : 'Reject'} this referral?`)) return;
      button.disabled = true;
      try {
        const status = await decideReferralReview(button.dataset.claimId || '', decision, note);
        document.querySelector<HTMLElement>('#admin-status')!.textContent = status === 'credited' ? 'Referral approved and bonuses issued.' : status === 'pending' ? 'Referral approved; eligibility checks are still pending.' : 'Referral rejected.';
        await loadReferralReviews();
      } catch (error) {
        document.querySelector<HTMLElement>('#admin-status')!.textContent = error instanceof Error ? error.message : 'Could not record the referral decision.';
        button.disabled = false;
      }
    }));
  } catch (error) {
    list.innerHTML = `<p class="muted">${esc(error instanceof Error ? error.message : 'You are not an approved owner.')}</p>`;
  }
}

function referralCard(claim: AdminReferralReview): string {
  const span = claim.activity_span_hours === null ? 'Not enough activity yet' : `${claim.activity_span_hours} hours from first activity to most recent`;
  const flags = claim.risk_flags.length ? claim.risk_flags.map((flag) => esc(flag.replaceAll('_', ' '))).join(', ') : 'No shared-device or network flags';
  const categories = claim.activity_categories.length ? claim.activity_categories.map((category) => esc(category.replaceAll('_', ' '))).join(', ') : 'No qualifying activities yet';
  return `<article class="admin-report"><div><strong>Referral submitted ${esc(new Date(claim.submitted_at).toLocaleString())}</strong><small>New account: ${esc(claim.referred_profile)} · Referrer: ${esc(claim.referrer_profile)}</small><p>Email verified: ${claim.email_verified ? 'yes' : 'no'} · Profile created: ${claim.profile_created ? 'yes' : 'no'}</p><p>Activity: ${categories} · ${esc(span)}</p><p>Review signals: ${flags}</p>${claim.review_note ? `<small>Previous note: ${esc(claim.review_note)}</small>` : ''}</div><div class="admin-report-controls"><button class="primary-button" data-referral-decision="approve" data-claim-id="${esc(claim.claim_id)}">Approve</button><button class="secondary-button" data-referral-decision="reject" data-claim-id="${esc(claim.claim_id)}">Reject</button></div></article>`;
}

async function loadReports(): Promise<void> {
  const list = document.querySelector<HTMLElement>('#report-list');
  if (!list) return;
  try {
    const reports = await adminReports();
    list.innerHTML = reports.length ? reports.map(reportCard).join('') : '<p class="muted">No reports.</p>';
    list.querySelectorAll<HTMLSelectElement>('[data-report-status]').forEach((select) => select.addEventListener('change', async () => {
      try { await updateReportStatus(select.dataset.reportId || '', select.value as AdminReport['status']); await loadReports(); }
      catch (error) { document.querySelector('#admin-status')!.textContent = error instanceof Error ? error.message : 'Could not update report.'; }
    }));
    list.querySelectorAll<HTMLSelectElement>('[data-report-action]').forEach((select) => select.addEventListener('change', async () => {
      const action = select.value as Exclude<AdminReport['action'], 'none'>;
      if (!action) return;
      const note = window.prompt('Optional moderation note:') || '';
      if (action === 'hide' && !window.confirm('Hide this target from other users?')) { select.value = ''; return; }
      try { await moderateReport(select.dataset.reportId || '', action, note); await loadReports(); }
      catch (error) { document.querySelector('#admin-status')!.textContent = error instanceof Error ? error.message : 'Could not apply moderation action.'; }
    }));
  } catch (error) {
    list.innerHTML = `<p class="muted">${esc(error instanceof Error ? error.message : 'You are not an approved owner.')}</p>`;
  }
}

function reportCard(report: AdminReport): string {
  const reversible = ['profile', 'post', 'message', 'room'].includes(report.target_type);
  const actionControl = reversible
    ? `<label>Action<select data-report-action data-report-id="${esc(report.id)}"><option value="">Choose action</option><option value="hide">Hide target</option><option value="unhide">Unhide target</option><option value="dismiss">Dismiss report</option></select></label>`
    : '<small class="admin-manual-review">Manual review only · media URLs cannot be revoked here</small>';
  return `<article class="admin-report"><div><strong>${esc(report.target_type)} report · ${esc(report.target_label)}</strong><small>Reported by ${esc(report.reporter_label)} · ${esc(new Date(report.created_at).toLocaleString())}</small><p><strong>Reported reason:</strong> ${esc(report.reason)}</p><p class="admin-target-excerpt">${esc(report.target_excerpt || 'No preview available.')}</p>${report.resolution_note ? `<small>Note: ${esc(report.resolution_note)}</small>` : ''}</div><div class="admin-report-controls"><label>Status<select data-report-status data-report-id="${esc(report.id)}"><option value="open" ${report.status === 'open' ? 'selected' : ''}>Open</option><option value="reviewing" ${report.status === 'reviewing' ? 'selected' : ''}>Reviewing</option><option value="resolved" ${report.status === 'resolved' ? 'selected' : ''}>Resolved</option><option value="dismissed" ${report.status === 'dismissed' ? 'selected' : ''}>Dismissed</option></select></label>${actionControl}</div></article>`;
}

draw();
document.querySelector('#admin-sign-in')?.addEventListener('click', async () => {
  try { await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } }); }
  catch (error) { document.querySelector('#admin-status')!.textContent = error instanceof Error ? error.message : 'Sign-in failed.'; }
});

db.auth.getSession().then(async ({ data }) => {
  if (!data.session) return;
  const actions = document.querySelector('#admin-actions');
  if (actions) actions.innerHTML = '<button class="primary-button" id="admin-refresh">Refresh</button><button class="secondary-button" id="admin-purge">Purge old resolved reports</button><button class="quiet-button" id="admin-sign-out">Sign out</button>';
  document.querySelector('#admin-refresh')?.addEventListener('click', () => { void loadReports(); void loadReferralReviews(); void loadSignupAbuse(); });
  document.querySelector('#admin-purge')?.addEventListener('click', async () => { if (!window.confirm('Remove resolved and dismissed reports older than 180 days?')) return; try { const count = await purgeModerationData(); document.querySelector('#admin-status')!.textContent = `${count} old report${count === 1 ? '' : 's'} removed.`; await loadReports(); } catch (error) { document.querySelector('#admin-status')!.textContent = error instanceof Error ? error.message : 'Could not purge old reports.'; } });
  document.querySelector('#admin-sign-out')?.addEventListener('click', () => void db.auth.signOut());
  await loadReports();
  await loadReferralReviews();
  await loadSignupAbuse();
});
