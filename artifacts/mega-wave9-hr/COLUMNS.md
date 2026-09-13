# Wave-9 Mega PDF column evidence

Source: `artifacts/mega-wave9-hr/pdf/`
Capture: `scripts/capture-mega-wave7-10-pdfs.mjs`
Login: `KM-01_01_2022` / `test`

Decoded from PDF render + `pdftotext -layout` + header-band visual read / OCR.
**No invented labels.** Failed paths have no columns listed.

---

## attendance → `hrreports-attendance`

Evidence: `pdf/attendance.pdf` · title: `حضور/انصراف الموظفين` · dates: `تاريخ من 01/01/2022 إلي 03/01/2022`

### Grid headers (RTL)

1. `التاريخ`
2. `وقت الحضور`
3. `وقت الانصراف`
4. `ساعات العمل`
5. `الاستئذان`
6. `الاستئذان بمهمة`
7. `تأخير`
8. `الوقت الاضافى`
9. `غير معروف`
10. `بدون حضور`
11. `بدون انصراف`
12. `عمل فى اجازة`
13. `الغياب بمهمه`
14. `اجازة`
15. `اجازة مستقطعة`
16. `الاجازة الاسبوعية`
17. `اجازة رسمية`

Footer labels seen: `أيام الحضور` · `ساعات الحضور` · `من اصل` / `من أصل`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، الادارة، الموظف، من تاريخ، الى تاريخ

---

## employeesvations → `hrreports-employeesvations`

Evidence: `pdf/employeesvations.pdf` · title: `اجازات الموظفين`

### Grid headers (RTL)

1. `النوع`
2. `تاريخ البدء`
3. `تاريخ الانتهاء`
4. `موافق عليها`

Grouping label: `اسم الموظف`. Balance/summary labels: `سنوية` · `عارضة` · `مرضى` · `اعتيادي` · `بخصم` · `المجموع`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، الموظف، النوع، من تاريخ، الى تاريخ، الحالة

---

## employeespayroll → `hrreports-employeespayroll`

Evidence: `pdf/employeespayroll.pdf` · title: `رواتب الموظفين` · period `من 1/2022` → `الى 3/2022` / `الى شهر : مارس`

**Detail/card mode** (per-employee form, not a wide grid). Exact field labels:

- `الراتب الأساسي:`
- `الوظيفة:`
- `فترة العمل الإضافي:` / `قيمة زيادة العمل الإضافي:`
- `فترة التأخير:` / `قيمة خصم التأخير:`
- `فترة الاستئذان:` / `قيمة خصم الاستئذان:`
- `ايام الغياب:` / `قيمة خصم الغياب:`
- `ايام عمل بالخصم:` / `قيمة عمل بالخصم:`
- `ايام الاجازات بالخصم:` / `قيمة الاجازات بالخصم:`
- `ايام عمل بالاجازات الرسمية:` / `قيمة العمل بالاجازات الرسمية:`
- `قيمة البدلات:` / `قيمة الحوافز:`
- `قيمة السلف:` / `قيمة خصم العقوبات:`
- `قيمة التأمينات:` / `قيمة خصومات أخرى:`
- `قيمة الضرائب:` / `قيمة زيادات أخرى:`
- `صافى الراتب:`
- `التوقيع:`

Department total label seen: `صافي رواتب الادارة`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، الادارة، الاسم، من شهر، من سنة، الى شهر، الى سنة

---

## employeespayroll-list → `hrreports-employeespayroll-list`

Evidence: `pdf/employeespayroll-list.pdf` · same title `رواتب الموظفين` · path `/HRReports/EmployeesPayroll.aspx/List`

**Distinct list/grid mode** (wide landscape table). Headers are two-line; combined (RTL):

1. `الاسم`
2. `الراتب الأساسي`
3. `السلف`
4. `عمل بالخصم`
5. `الضرائب`
6. `التأمينات`
7. `خصم العقوبات`
8. `خصم التأخير`
9. `خصم الاستئذان`
10. `خصم الغياب`
11. `خصومات أخرى`
12. `الاجازات بالخصم`
13. `زيادة العمل الإضافي`
14. `العمل بالاجازات`
15. `الحوافز`
16. `زيادات أخرى`
17. `البدلات`
18. `صافى الراتب`

Job title appears under employee name in parentheses (e.g. `(غفير)`). Grouped by department grey bar.

### Filters

Same control set as payroll detail in `FILTERS-BY-REPORT.md` (`hrreports-employeespayroll-list`).

---

## employeesunderrequest → `hrreports-employeesunderrequest`

Evidence: `pdf/employeesunderrequest.pdf` · title: `موظفين تحت الطلب` · **empty data rows** but headers present.

### Grid headers (RTL)

1. `الاسم`
2. `الرقم القومي`
3. `الوظيفة`
4. `نتيجة الاختبار - الجودة`
5. `نتيجة الاختبار - السرعة`
6. `تاريخ الاختبار`
7. `رقم التليفون`
8. `تليفون آخر`

### Filters (from `FILTERS-BY-REPORT.md`)

الاسم، الوظيفة، من تاريخ، الى تاريخ

---

## employeeslist → `hrreports-employeeslist`

Evidence: `pdf/employeeslist.pdf` · title: `قائمة الموظفين`

Card/profile layout per employee (grouped by department). Exact field labels:

- `الراتب الاساسي:`
- `التامينات:`
- `العملة:`
- `تاريخ الميلاد:`
- `الرقم القومي:`
- `الموقف التجنيدي:`
- `الحالة الاجتماعية:`
- `الديانة:`
- `الجنسية:`
- `فترة العمل:`
- `تاريخ التعيين:`
- `الفرع:`
- `الوظيفة:`
- `الاجازات الاعتيادي:`
- `رقم ماكينة البصمة:`
- `الاجازات العارضة:`
- `تاريخ انهاء الخدمة:`
- `سبب انهاء الخدمة:`

Department totals: `اجمالى رواتب الادارة` · `اجمالى تأمينات الادارة`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، المسلسل، الاسم، فترة العمل، الادارة، الوظيفة، تاريخ التعيين من، تاريخ التعيين الى، الحالة

---

## loans-list → `hrreports-loans-list`

Evidence: `pdf/loans-list.pdf` · title: `سلف الموظفين` · path `/HRReports/Loans.aspx/List`

### Grid headers (RTL)

1. `المسلسل`
2. `الفرع`
3. `التاريخ`
4. `تاريخ البداية`
5. `المبلغ`
6. `الحساب الدائن`
7. `عدد الاقساط`
8. `حالة التقسيط`
9. `ملاحظات`

Footer labels: `اجمالى الموظف` · `اجمالى الدارة` · `اجمالى الكل`.

### Filters (from `FILTERS-BY-REPORT.md`)

الفرع، العملة، من تاريخ، الى تاريخ، الادارة، الموظف، حالة التقسيط، اخفاء التفاصيل

---

## loans → non-List path `/HRReports/Loans.aspx`

**FAILED — no PDF.**

- Result: Authorization — `الوصول مرفوض! ليس لديك صلاحيات كافية للوصول للصفحة المطلوبة`
- Screenshot: `pdf/loans-blocked.png`
- Mapped Easy slug uses List path (`hrreports-loans-list`); non-List path blocked on this login.

**No column headers from this path.**
