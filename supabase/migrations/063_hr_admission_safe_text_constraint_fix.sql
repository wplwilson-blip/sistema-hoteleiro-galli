-- RH-32G.1A - Corrige falso positivo da validacao de texto seguro da admissao.
-- A migration 062 bloqueava sequencias como "rg" dentro de palavras comuns
-- como "divergencia" e "registro". Aqui os termos sensiveis passam a ser
-- tratados como tokens isolados ou padroes explicitos.

alter table public.hr_admission_processes
  drop constraint if exists hr_admission_processes_text_safe_check;

alter table public.hr_admission_checklist_items
  drop constraint if exists hr_admission_checklist_items_text_safe_check;

alter table public.hr_admission_processes
  add constraint hr_admission_processes_text_safe_check check (
    coalesce(job_title, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(cbo_code, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(department_name, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(notes, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
  );

alter table public.hr_admission_checklist_items
  add constraint hr_admission_checklist_items_text_safe_check check (
    item_key !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and title !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(description, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(source_requirement_key, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(source_rule_group, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(waiver_reason, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
    and coalesce(notes, '') !~* '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}|(^|[^[:alnum:]_])(cpf|rg|ctps|pis|salario|salário|salary|folha|e-?social|calculo|cálculo|financeiro|valor|valores|remuneracao|remuneração|auth_email|senha|password|token|file_path|storage_path|signed_url|dados bancarios|dados bancários|conta corrente|pix|agencia|agência)([^[:alnum:]_]|$))'
  );
