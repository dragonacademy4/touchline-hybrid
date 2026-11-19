import { Shell } from '../components';

export function Privacy() {
  return (
    <Shell title="Privacy" backTo={{ name: 'settings' }}>
      <article class="stack" style={{ maxWidth: '62ch' }}>
        <p class="lead">Touchline is built so that children's names stay on the coach's phone. Here is exactly what goes where.</p>

        <h2 class="title">On this phone</h2>
        <p>Your squad (first names and nicknames), session notes, player cards and reports are stored in this browser's storage on this device. Nobody else can see them. Delete them any time in Settings, or by clearing the site's data in your browser.</p>

        <h2 class="title">AI on this device (Gemini Nano)</h2>
        <p>Where Chrome's built-in Gemini Nano is available, session notes are structured on the phone itself. Nothing is sent anywhere for that step.</p>

        <h2 class="title">AI in the cloud (Google Gemini)</h2>
        <p>Weekly parent updates, 4-week progress reports, and session notes on devices without Gemini Nano are written by a Google Gemini model through Firebase AI Logic. Before anything is sent, Touchline replaces every squad name and nickname with a code such as P03, and hides any extra words you list in Settings, plus email addresses and phone numbers. If a name is still found in the text, nothing is sent. The list that links codes to names never leaves the phone. Every cloud result has a "What the cloud saw" panel showing the exact text sent.</p>
        <p>Touchline uses Google's free tier for this, under which Google may use submitted text to improve its products. That is one more reason names are removed first.</p>

        <h2 class="title">Anonymised backups (Firestore)</h2>
        <p>If "Back up anonymised sessions" is on, a copy of each structured session is saved in Google Cloud Firestore (London region) under an anonymous sign-in. The copy holds the date, group, focus and feedback with codes instead of names. It can't be linked back to a child without your phone. "Delete everything" removes these copies too.</p>

        <h2 class="title">Keeping the service safe</h2>
        <p>Firebase App Check with Google reCAPTCHA v3 checks that requests come from the real Touchline app. reCAPTCHA collects information about your browser and device for this, under Google's privacy policy. Firebase Remote Config fetches app settings such as which cloud model to use.</p>

        <h2 class="title">What Touchline doesn't do</h2>
        <p>No analytics, no advertising, no tracking cookies, no accounts, no cloud speech recognition. Voice notes only work where Chrome recognises speech on the device.</p>

        <h2 class="title">For coaches</h2>
        <p>Touchline is for coaches, not children. Follow your club's safeguarding and data policy for player notes, and share cards and updates only with the child's parents or carers.</p>

        <h2 class="title">Who we are</h2>
        <p>Touchline is made by ImpactLayer, a trading name of Dragon Academy Ltd (company number 16871720), 71-75 Shelton Street, Covent Garden, London WC2H 9JQ. ICO registration ZC284602. Questions or requests: <a href="mailto:support@impactlayer.co.uk">support@impactlayer.co.uk</a>.</p>
        <p class="caption muted">Updated 19 November 2026.</p>
      </article>
    </Shell>
  );
}
