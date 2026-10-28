# CheckIn – Building Geofence Attendance: Work Report

Oct 16, 2026 · @Dechen

## Summary

CheckIn now checks that a student is physically inside the right campus building, or inside the tutor's workshop radius, before marking them present. The change touches 13 files (11 modified, 2 new) on branch `feature/building-geofence`, needs no database change, and is ready to commit and open as a PR into `dev`.

All 13 files on Dechen's machine were compared line by line against the intended version and match. The full end-to-end test still needs a module with a tutor assigned and a student enrolled.

## What the feature does

The student attendance page shows 5 cards: 4 campus buildings plus a Workshop / Practical card. A card can only be tapped when the student has a class open there right now.

| Card | Geofence | Rooms |
| --- | --- | --- |
| IT Building | Building outline from geojson.io | IT 01–05, ITL 01–11 (labs) |
| LT Building | Building outline from geojson.io | LT 01, LT 02 |
| Academic Building | Building outline from geojson.io | CR 1–CR 13 |
| Architecture Building | Building outline from geojson.io | CR 14, 16, 17, Drawing Studio 01–02 |
| Workshop / Practical | Circle around the tutor's live GPS, radius set by the tutor (5–500 m) | Any site, e.g. CEED and Mechanical practicals |

**Tutor flow (Start Attendance)**

1. Choose the module, room, type and hours as before.
2. Typing a room such as `ITL 06` selects its building automatically; the tutor can still change it.
3. Choosing "practical" switches the location to Workshop, where the tutor enters a radius and stands in the middle.
4. Generate the code. Building sessions need no tutor GPS; workshop sessions use it as the centre.

**Student flow (Attendance)**

1. Tap the building card that lights up.
2. Pick the class (auto-picked when there is only one).
3. Enter the code and check in. The phone's GPS is checked against the building outline or the workshop circle.

Building check-ins allow 10 m outside the walls for GPS drift. Your existing rules still apply: clearly outside is refused, weak GPS is flagged for the tutor, and the code must belong to the class the student picked.

## Changes actually made

13 files changed: 11 modified and 2 new, about 520 lines added. Nothing in the database structure changed.

| File | Status | What changed |
| --- | --- | --- |
| `backend/src/config/buildings.js` | New | The 4 building outlines, a fixed anchor point inside each, room lists, and the room-to-building matcher (accepts "ITL06", "itl-6", "CR3", "Drawing Studio 2", lab names) |
| `backend/src/utils/geofence.js` | New | Point-in-polygon test and "metres outside the nearest wall" calculation |
| `backend/src/services/checkin.service.js` | Modified | Building vs workshop check at check-in; code must match the chosen class; new `liveClasses()` for the cards |
| `backend/src/services/session.service.js` | Modified | Start session in building or workshop mode; works out the building from the room; returns `location` |
| `backend/src/validators/session.validators.js` | Modified | New `mode`, `building`, workshop `radius` rules; tutor GPS only required for workshop |
| `backend/src/validators/checkin.validators.js` | Modified | Optional `sessionId` (the class picked on the card) |
| `backend/src/controllers/checkin.controller.js` | Modified | Handler for the live-classes route |
| `backend/src/routes/attendance.routes.js` | Modified | New `GET /api/attendance/live` |
| `backend/src/routes/session.routes.js` | Modified | New `GET /api/sessions/buildings` |
| `backend/API.md` | Modified | Documents the new fields and routes |
| `frontend/src/pages/student/Attendance.jsx` | Modified | 5 building cards, class picker, code entry |
| `frontend/src/pages/student/attendance.css` | Modified | Styles for the cards and class list |
| `frontend/src/pages/teacher/StartAttendance.jsx` | Modified | Room suggestions, "Where students must be" dropdown, workshop radius, location shown on the live code panel |

**Why no database change:** a building session saves the building's anchor point in the existing `attendance_codes.latitude/longitude` and the 10 m tolerance in `geofence_radius`. At check-in the anchor is matched back to its building. Workshop sessions save the tutor's GPS and radius, as before. A dedicated `building` column would be cleaner later; that is the team lead's call.

## Steps followed to add it

1. Drew the 4 building outlines on geojson.io and shared them as `IT_Building.zip`. Each export also contained the shapes drawn before it, so the newest shape in each file was taken as that building.
2. Supplied the room list for each building, which was added to `buildings.js`.
3. Pulled the latest `dev` (commit `d7c1915`) and created the branch `feature/building-geofence`.
4. Created `buildings.js` and `geofence.js` by hand first. Because those files then already existed, `git apply` would not add the rest.
5. Replaced the 13 files with the complete versions from `building-geofence-files.zip`.
6. Exported the current code to `mycode.txt` with a terminal command and uploaded it. All 13 files were compared line by line and matched; `git status` showed the 11 modified and 2 new files.

## Testing and verification

The check-in logic passed every test with mock data; testing against the real Supabase database and on phones is still to do.

| Check | Result |
| --- | --- |
| Each building's anchor point lies inside its own outline | Pass |
| Student inside LT Building, checking in to an LT class | Present |
| Student in IT Building, checking in to an LT class | Refused (about 24 m outside) |
| Same, with weak GPS (40 m accuracy) | Flagged for the tutor |
| Code from a different class than the one picked | Refused |
| Workshop: 10 m from tutor with a 30 m radius | Present |
| Workshop: 60 m from tutor | Refused |
| Room names ("ITL06", "itl-6", "CR3", "CR-14", "LT01", "Drawing Studio 2", "Data Science Lab") | Matched to the right building |
| Frontend build (`vite build`) | No errors |
| Backend start on Dechen's machine | No errors |
| Dechen's 13 files vs intended version | All match |

**Not yet tested:** a full session against the real database, and real phones inside the buildings. Indoor GPS can be off by 20–50 m, which may cause more flagged check-ins.

## Problems found along the way

None of these were caused by the geofence change.

| Problem | Cause | Fix |
| --- | --- | --- |
| Frontend calls returned 404 (`/apiy/...`) | Typo in local `frontend/.env` | Set `VITE_API=http://localhost:5001/api` and restarted the frontend. Local only, not committed |
| `localhost:5001` showed "No route for GET /" | That is the backend, which has no web page | Open the frontend at `localhost:5173` instead |
| 3 junk files: `(d`, `[(lng`, `distanceToRingMeters(point` | JavaScript pasted into the Windows terminal; `>` creates files | Deleted with `del` |
| `git apply` did not add the changes | `buildings.js` and `geofence.js` already existed | Copied the complete files from the zip instead |
| Vite warnings about `/photo/front.jpg` and `logo.jpg` | Existing code in `Landing.jsx` imports from the public folder | Harmless; left for a separate small fix |
| B.E. Software Engineering page shows 0 students, tutors and modules | No modules linked to that programme; 14 programmes exist where 13 were expected, so there may be a duplicate | Data issue: check Program / Module page; team lead if the curriculum is missing |

## Email for forgot-password codes

No code change is needed: the app already emails each user's reset code to the address they gave at signup. It is switched off because `backend/.env` has no email settings, so codes are printed in the backend terminal instead.

To switch it on, add these 5 lines to `backend/.env`, using one Gmail made just for the project as the sender:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<project gmail>
SMTP_PASS=<16-letter Google app password>
MAIL_FROM=CheckIn <project gmail>
```

Then restart the backend and run `npm run mail:test -- <your email>`. A normal Gmail sends about 500 emails a day; for real college use, the team lead swaps these lines for the college mail server or a mail service.

**Security:** the Supabase database password and `JWT_SECRET` were pasted into chat. The team lead should reset the database password in Supabase and change `JWT_SECRET`. `.env` must never be committed.

## Next steps

- [ ] Commit only `backend/src`, `backend/API.md` and `frontend/src` (not `.env` or `package-lock.json`)
- [ ] Push `feature/building-geofence` and open a PR into `dev`
- [ ] Tell the team lead: no database change needed; reset the leaked Supabase password and `JWT_SECRET`
- [ ] Set up test data: a module with the test tutor assigned and the test student enrolled
- [ ] Run a full session: tutor starts in `ITL 06`, student checks in using Chrome Sensors at 26.849435, 89.391926
- [ ] Test on real phones inside each building and tune the 10 m tolerance if needed
- [ ] Confirm which building CR 15 is in (missing from the room list)
- [ ] Optional: set up the project Gmail so reset codes are emailed
