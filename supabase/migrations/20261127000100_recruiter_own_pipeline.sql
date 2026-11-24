-- =====================================================================
-- Рекрутер змінює лише свої воронки
-- =====================================================================
-- Раніше рекрутер міг додавати кандидатів і переміщати їх по етапах у будь-якій вакансії.
-- Тепер — лише у вакансіях, де він рекрутер або керівник-замовник (scope = own).
-- Перегляд усіх вакансій і воронок (applications.read = all) не змінюється.

update public.role_permissions rp
   set scope = 'own'
  from public.roles r
 where rp.role_id = r.id
   and r.code = 'recruiter'
   and rp.permission_code in ('applications.create', 'applications.update');
