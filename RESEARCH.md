# Research notes

Research done on 2026-10-16 before building the app. Each point lists the source it is based on. Items marked **(unverified)** were not confirmed from a primary source in this session.

## 1. Three-ball incentive spirometer (Triflo type)

| Topic | What sources say | Used in app |
|---|---|---|
| How often | 10 to 15 breaths every 1 to 2 hours ([MedlinePlus](https://medlineplus.gov/ency/patientinstructions/000451.htm)); sets of 10 every hour while awake, no more than 30 per set ([UMass Memorial](https://www.ummhealth.org/health-library/using-an-incentive-spirometer)); 5 reps every hour ([ULHT NHS leaflet](https://website.ulh.nhs.uk/documents/patient_information_leaflets/1923%20Incentive%20Spirometer%20v2.pdf)) | Default 10 reps, hourly 08:00 to 21:00, all adjustable |
| Hold | 3 to 5 s ([MedlinePlus](https://medlineplus.gov/ency/patientinstructions/000451.htm), [UMass](https://www.ummhealth.org/health-library/using-an-incentive-spirometer)); 2 to 3 s ([York NHS](https://yorkhospitals.nhs.uk/seecmsfile/?id=6029)) | Default 3 s, range 1 to 10 |
| Technique | Seal lips, slow deep inhale, hold, exhale slowly, rest; if dizzy remove mouthpiece and breathe normally ([MedlinePlus](https://medlineplus.gov/ency/patientinstructions/000451.htm)) | Phases prep / inhale / hold / exhale / rest, dizziness note on every session screen |
| Balls | Chambers marked 600, 900, 1200 cc per second, i.e. inspiratory **flow**, not volume ([product listing](https://www.skroutz.gr/s/37980382/Plasti-med-Triflo-Breathing-Trainer-with-3-Balls-180101.html), [Medline EU](https://medline.eu/ie/triflor-ii-incentive-spirometer)) | Target = number of balls (1 to 3), shown with the flow value; user logs how many rose |
| Target | Set by the clinician ([UMass](https://www.ummhealth.org/health-library/using-an-incentive-spirometer)) | Disclaimer in onboarding and settings |

## 2. Breathing exercises

- **Box breathing**: equal inhale, hold, exhale, hold. In [Balban et al. 2023, Cell Reports Medicine](https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947) phase length was 3 to 10 s depending on a CO2 tolerance test, with instructions to shorten if straining. App default 4-4-4-4, range 2 to 10 s.
- **Cardiac coherence ("365")**: 3 times a day, 6 breaths per minute (5 s in, 5 s out), 5 minutes ([Aix-Marseille Univ. doctoral school](https://ecole-doctorale-658.univ-amu.fr/en/phd-student/tools-these-stress), [O'Hare, Heart coherence 365](https://www.colibri.bg/en/shop/david-ohare-heart-coherence-365-a-guide-to-long-lasting-heart-coherence)). App default: 5/5 s, 5 min, reminders 08:30, 13:00, 20:00.
- **Stress relief, cyclic sighing**: long inhale, short second inhale, long slow exhale, 5 min a day. In the 28-day RCT (n=108) cyclic sighing was the only single breathwork group with a significantly larger positive-affect gain than mindfulness and a larger drop in respiratory rate ([Balban et al. 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947)). The paper gives no exact seconds; app uses 2.5 s + 1 s in, 6 s out (adjustable). Exclusions in that study included moderate to severe heart disease and pregnancy.

## 3. Platform limits that shaped the architecture

| Need | Finding | Decision |
|---|---|---|
| Vibration on iPhone from a web app | iOS Safari does not implement `navigator.vibrate` ([MDN compat via bugnet](https://bugnet.io/blog/fix-web-game-vibrate-api-not-available-ios-safari), [progressier](https://progressier.com/pwa-capabilities/vibration-api)). A workaround clicks a hidden `<input type="checkbox" switch>` ([ios-haptics](https://npmjs.com/package/ios-haptics)) but WebKit made that haptic require user activation ([WebKit bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120)), so it cannot drive a timed breathing pattern. | iOS web gets sound + animation only. Full haptics through a native app. |
| Vibration strength on Android web | Web Vibration API is on/off only, no amplitude. | Pulse-width modulation of the envelope (`toPwmPattern`). |
| Smooth "lung" vibration natively | iOS: Core Haptics continuous events with intensity/sharpness parameter curves. Android: `VibrationEffect.createWaveform(timings, amplitudes)` on devices with amplitude control. | Own Capacitor plugin `plugins/lung-haptics`. Curve chunking at 16 control points per curve **(unverified limit, chosen conservatively)**. |
| Reminders when the app is closed | A web app cannot schedule notifications without a push server. Capacitor Local Notifications supports `schedule.on { hour, minute }` repeating schedules on iOS and Android; `allowWhileIdle` fires at most once per 9 minutes per app ([Capacitor docs](https://capacitorjs.com/docs/v3/apis/local-notifications)). iOS keeps at most 64 pending local notifications **(unverified in this session, well known platform limit)**. | Native: daily repeating local notifications, capped at 64 slots. Web: in-app reminders while open plus `.ics` calendar export with alarms. |
| Building Android here | Android SDK and Maven hosts are blocked from this build sandbox (403 from proxy). | APK built by GitHub Actions and published as a release. |
| iOS distribution | Installing on an iPhone needs Apple signing (developer account). | CI compiles the iOS project for the simulator to verify the Swift code. Signing and TestFlight are a manual next step. |

## 4. Haptic design ("lungs")

Envelope sampled every 40 ms (`src/haptics/envelope.js`):

- **Inhale**: amplitude rises 0.12 → 0.9 with ease-in-out and a soft airflow ripple (~3 Hz); sharpness rises.
- **Second inhale (sigh)**: short strong top-up.
- **Hold (full)**: low steady pressure with a lub-dub heartbeat every second (can be turned off).
- **Exhale**: amplitude drains 0.77 → 0.05 with ease-out, ripple fades.
- **Hold (empty)**: near silence, faint pulse each second.
- Every phase starts with a short crisp tap so phase changes are felt with eyes closed.
