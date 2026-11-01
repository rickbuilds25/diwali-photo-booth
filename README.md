# Diwali Photo Booth

A browser photo booth for Arindam, Pawnita & Rian's Diwali Party 2026.
Open the page on a phone, tap **Start the booth**, and it takes a framed photo whenever the people in front of it smile.

- Smile detection runs on the phone (MediaPipe Face Landmarker, served from this repo). Nothing is uploaded.
- On a laptop each photo saves itself to Downloads when its 10-second preview ends: a framed copy and an `-original` copy without the frame.
- On an iPad or iPhone (Safari or Chrome) the browser asks before every download, so photos stay on the device instead. Open **Photos** and tap **Save to Photos**: each tap sends 20 photos and their originals to the share sheet; choose **Save Images**. Add `?autosave=on` or `?autosave=off` to override.
- URL options: `?sens=0.45` smile threshold, `?hold=0.7` seconds of smiling, `?count=3` countdown, `?preview=10` seconds before each photo saves, `?cam=back` rear camera, `?zoom=2` how far the second detector zooms in for people standing further back, `?debug` live readout.

MediaPipe Tasks Vision is © Google, Apache License 2.0. Fonts: Yatra One and Cormorant Garamond, SIL Open Font License.

## Guest gallery

Saved photos (the framed copies only) can go to a Google Drive folder through a small Apps Script that you own. Guests scan the QR code on the table cards to open `gallery.html`, which shows the photos live and lets them save picked ones to their phone.

- The script URL goes in `config.js`.
- The booth device is set up once with `?upload=<UPLOAD_KEY>`; the key is remembered on that device and never stored in this repo.
- The QR code links to `gallery.html#k=<VIEW_KEY>`.
