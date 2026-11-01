# Diwali Photo Booth

A browser photo booth for Arindam, Pawnita & Rian's Diwali Party 2026.
Open the page on a phone, tap **Start the booth**, and it takes a framed photo whenever the people in front of it smile.

- Smile detection runs on the phone (MediaPipe Face Landmarker, served from this repo). Nothing is uploaded.
- Photos are kept on the booth phone until you save them from the photo roll.
- URL options: `?sens=0.45` smile threshold, `?hold=0.7` seconds of smiling, `?count=3` countdown, `?cam=back` rear camera, `?zoom=2` how far the second detector zooms in for people standing further back, `?debug` live readout.

MediaPipe Tasks Vision is © Google, Apache License 2.0. Fonts: Yatra One and Cormorant Garamond, SIL Open Font License.
