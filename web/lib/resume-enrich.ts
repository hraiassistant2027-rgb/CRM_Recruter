import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { parseResumeStructure, type ResumeStructure } from './resume-structure';

type Supa = Awaited<ReturnType<typeof createClient>>;

export type EnrichResult = { experience: number; education: number; skills: number; summary: boolean; total: boolean; source: boolean };

// Доповнює картку кандидата даними з резюме: досвід, освіта, навички, «про себе», стаж, джерело.
// Заповнює лише порожнє (нічого, що вже ввів рекрутер, не перезаписує). replaceLists = true —
// замінити досвід і освіту (кнопка «Оновити з резюме» в картці).
export async function enrichCandidate(
  supabase: Supa,
  candidateId: string,
  text: string | null,
  fileName: string,
  opts: { replaceLists?: boolean } = {},
): Promise<EnrichResult | null> {
  if (!text || text.trim().length < 50) return null;
  const s: ResumeStructure = parseResumeStructure(text, fileName);
  const res: EnrichResult = { experience: 0, education: 0, skills: 0, summary: false, total: false, source: false };

  const [{ data: cand }, { count: expCount }, { count: eduCount }] = await Promise.all([
    supabase.from('candidates').select('skills, summary, total_experience_months, source_id').eq('id', candidateId).maybeSingle(),
    supabase.from('candidate_experience').select('id', { count: 'exact', head: true }).eq('candidate_id', candidateId),
    supabase.from('candidate_education').select('id', { count: 'exact', head: true }).eq('candidate_id', candidateId),
  ]);
  if (!cand) return null;

  const update: Record<string, unknown> = {};
  if ((!cand.skills || cand.skills.length === 0) && s.skills.length) {
    update.skills = s.skills;
    res.skills = s.skills.length;
  }
  if (!cand.summary && s.summary) {
    update.summary = s.summary;
    res.summary = true;
  }
  if (cand.total_experience_months == null && s.totalMonths) {
    update.total_experience_months = s.totalMonths;
    res.total = true;
  }
  if (!cand.source_id && s.source) {
    const { data: src } = await supabase.from('sources').select('id, name').eq('is_active', true);
    const match = ((src ?? []) as { id: string; name: string }[]).find((x) => x.name.toLowerCase() === s.source!.toLowerCase());
    if (match) {
      update.source_id = match.id;
      res.source = true;
    }
  }
  if (Object.keys(update).length) {
    const { error } = await supabase.from('candidates').update(update).eq('id', candidateId);
    if (error) return null;
  }

  if (s.experience.length && (opts.replaceLists || !expCount)) {
    if (opts.replaceLists && expCount) await supabase.from('candidate_experience').delete().eq('candidate_id', candidateId);
    const { error } = await supabase.from('candidate_experience').insert(
      s.experience.map((e, i) => ({
        candidate_id: candidateId,
        position: e.position,
        company: e.company,
        start_date: e.start,
        end_date: e.end && e.start && e.end < e.start ? null : e.end,
        description: e.description,
        sort_order: i,
      })),
    );
    if (!error) res.experience = s.experience.length;
  }
  if (s.education.length && (opts.replaceLists || !eduCount)) {
    if (opts.replaceLists && eduCount) await supabase.from('candidate_education').delete().eq('candidate_id', candidateId);
    const { error } = await supabase.from('candidate_education').insert(
      s.education.map((e, i) => ({
        candidate_id: candidateId,
        institution: e.institution,
        degree: e.degree,
        speciality: e.speciality,
        year_end: e.year_end,
        sort_order: i,
      })),
    );
    if (!error) res.education = s.education.length;
  }
  return res;
}

export function describeEnrich(r: EnrichResult | null): string | null {
  if (!r) return null;
  const parts: string[] = [];
  if (r.experience) parts.push(`досвід (${r.experience})`);
  if (r.education) parts.push(`освіту (${r.education})`);
  if (r.skills) parts.push(`навички (${r.skills})`);
  if (r.summary) parts.push('«про себе»');
  if (r.total) parts.push('загальний стаж');
  if (r.source) parts.push('джерело');
  return parts.length ? `З резюме додано: ${parts.join(', ')}` : null;
}
