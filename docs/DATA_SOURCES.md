# Data sources

CheckIn is a prototype. Real student and staff records will only be provided by CST after the project is approved. Until then, the database contains:

1. **Public institutional data**, copied from CST's official websites and referenced below.
2. **Synthetic test data** for people and attendance, made up for testing only.

## 1. Public data used

| Data in the database | Table(s) | Source |
|---|---|---|
| 6 academic departments (name, code, website) | `departments` | CST home page department menu and each department site |
| 13 programmes (name, level, duration, department) | `programs` | CST programmes page; department sites |
| B.E. Software Engineering curriculum: 27 modules by year and semester | `modules`, `program_modules` | CTD, B.E. Software Engineering page |
| B.E. Information Technology curriculum: 35 modules by year and semester | `modules`, `program_modules` | CTD, B.E. Information Technology page |

Notes:
- Elective placeholders ("Elective I–VIII") are not included because they are not specific modules.
- Modules taught in both programmes (for example MAT110 and CTE205) are stored once and linked to each programme with that programme's own year and semester.
- The Architecture Department site was under maintenance when it was accessed, so its full name is assumed.
- The website does not say which department offers the M.E. Renewable Energy or the MSc Eng (by Research), so these have no department.

## 2. Synthetic (made-up) data

| Data | Notes |
|---|---|
| Users `U001`–`U008` | Named "Test Admin", "Test Tutor 01", "Test Student 01" and so on, with `@example.com` emails. They are not real people. |
| Demo modules DBS201, NET202, WEB204 and their sections, sessions, attendance, evidence documents and notifications | Created by the team only to demonstrate the workflows. |
| Test accounts `CST-ICT01`, `CST-MGT01` | Admin and management test logins. |

All test accounts use the same test password. They must be removed or deactivated before real use.

## 3. When real data is provided

After approval, CST (ICT / DAA) supplies the real lists of students, staff, modules and enrolments. These replace the synthetic records, and no code changes are needed.

## References (APA 7th)

College of Science and Technology. (2026). *Programmes*. Royal University of Bhutan. Retrieved October 10, 2026, from https://cst.edu.bt/programmes/

College of Science and Technology. (2026). *College of Science and Technology* [Home page]. Royal University of Bhutan. Retrieved October 10, 2026, from https://cst.edu.bt/

Computing Technologies Department. (2026). *B.E Software Engineering*. College of Science and Technology. Retrieved October 10, 2026, from https://ctd.cst.edu.bt/?page_id=3148

Computing Technologies Department. (2026). *B.E Information Technology*. College of Science and Technology. Retrieved October 10, 2026, from https://ctd.cst.edu.bt/?page_id=3322

Computing Technologies Department. (2026). *Computing Technologies Department*. College of Science and Technology. Retrieved October 10, 2026, from https://ctd.cst.edu.bt/

Civil and Environmental Engineering Department. (2026). *Civil and Environmental Engineering Department*. College of Science and Technology. Retrieved October 10, 2026, from https://ceed.cst.edu.bt/

Electrical and Electronics Engineering Department. (2026). *Electrical and Electronics Engineering Department*. College of Science and Technology. Retrieved October 10, 2026, from https://eeed.cst.edu.bt/

Mechanical Engineering Department. (2026). *Mechanical Engineering – College of Science & Technology*. College of Science and Technology. Retrieved October 10, 2026, from https://med.cst.edu.bt/

Science and Humanities Department. (2026). *Science and Humanities Department*. College of Science and Technology. Retrieved October 10, 2026, from https://shd.cst.edu.bt/
