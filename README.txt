Dashboard Fix Files
===================

Copy these files into your project root:

D:\work\pour-over-tracker\src\app.ts
D:\work\pour-over-tracker\views\home\index.ejs

What this fixes:
- / no longer redirects to /brew-sessions
- / renders the real dashboard page
- Dashboard still has Add Brew button that correctly goes to /brew-sessions/new
- Signed-out users are still redirected to /auth/sign-in

After copying files, run:

cd D:\work\pour-over-tracker
npm.cmd run dev

Then test:

http://localhost:3000/

