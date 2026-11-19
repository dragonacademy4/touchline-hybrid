import { Shell } from '../components';

export function Privacy() {
  return (
    <Shell title="Privacy" backTo={{ name: 'settings' }}>
      <article class="stack" style={{ maxWidth: '62ch' }}>
        <p class="lead">Touchline is built so that children's names are hidden on the coach's phone before anything is sent. Here is exactly what goes where, and what it can't catch.</p>

        <h2 class="title">On this phone</h2>
        <p>Your squad (first names and nicknames), session notes, player cards and reports are stored in this browser's storage on this device. Nobody else can see them. Delete them any time in Settings, or by clearing the site's data in your browser.</p>

        <h2 class="title">AI on this device (Gemini Nano)</h2>
        <p>Where Chrome's built-in Gemini Nano is available, session notes are structured on the phone itself. Nothing is sent anywhere for that step.</p>

        <h2 class="title">AI in the cloud (Google Gemini)</h2>
        <p>Weekly parent updates, 4-week progress reports, and session notes on devices without Gemini Nano are written by a Google Gemini model through Firebase AI Logic. This is on by default; you can switch it off in Settings. Before anything is sent, Touchline replaces the squad's names and nicknames (and each part of a name, so "Ollie" is hidden for "Ollie S") with a code such as P03, and hides any extra words you list in Settings, plus email addresses and phone numbers. A final check looks for those names again, and if one is still there, nothing is sent. The list that links codes to names never leaves the phone. Every cloud result has a "What the cloud saw" panel showing the exact text sent.</p>
        <p>What it can't catch: spellings Touchline hasn't been told about (write "Olly" for "Ollie" and it won't recognise it, so add common spellings as nicknames), names of people who aren't in your squad or hidden-words list, and names that are also everyday words (Will, Mark, Max, Grace…) when written in lowercase, because "he will need to" has to stay readable. Check "What the cloud saw" if you're unsure.</p>
        <p>Touchline uses Google's free tier for this, under which Google may use submitted text to improve its products. That is one more reason names are removed first.</p>

        <h2 class="title">Anonymised backups (Firestore)</h2>
        <p>Off unless you turn it on (on the first screen or in Settings). When on, a copy of each structured session is saved in Google Cloud Firestore under an anonymous sign-in. The copy holds the date, group, focus and feedback with codes instead of names; it can't be linked back to a child without your phone. Deleting a session deletes its copy. "Delete everything" deletes every copy on the server and the anonymous sign-in itself, and won't run without signal, so nothing is left behind.</p>

        <h2 class="title">Keeping the service safe</h2>
        <p>Firebase App Check with Google reCAPTCHA Enterprise checks that requests come from the real Touchline app. reCAPTCHA collects information about your browser and device for this, under Google's privacy policy. Firebase Remote Config fetches app settings such as which cloud model to use.</p>

        <h2 class="title">What Touchline doesn't do</h2>
        <p>No analytics, no advertising, no tracking cookies, no accounts, no cloud speech recognition. Voice notes only work where Chrome recognises speech on the device. Spell check is turned off in the note and name boxes, because Chrome's enhanced spell check sends typed text to Google. Children's names are kept out of page titles, which browsers store in history.</p>

        <h2 class="title">For coaches</h2>
        <p>Touchline is for coaches, not children. Follow your club's safeguarding and data policy for player notes, and share cards and updates only with the child's parents or carers.</p>

        <h2 class="title">Who we are</h2>
        <p>Touchline is made by ImpactLayer, a trading name of Dragon Academy Ltd (company number 16871720), 71-75 Shelton Street, Covent Garden, London WC2H 9JQ. ICO registration ZC284602. Questions or requests: <a href="mailto:support@impactlayer.co.uk">support@impactlayer.co.uk</a>.</p>
        <p class="caption muted">Updated 19 November 2026.</p>
      </article>
    </Shell>
  );
}
