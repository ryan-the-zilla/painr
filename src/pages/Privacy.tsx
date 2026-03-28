export default function Privacy() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: '-apple-system, system-ui, sans-serif', color: '#e5e5e5', background: '#0a0a0a', minHeight: '100vh', lineHeight: 1.7 }}>
      <a href="/" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Terug naar Painr</a>
      <h1 style={{ fontSize: '1.8rem', marginTop: 16 }}>Privacy Policy</h1>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>Last updated: March 28, 2026</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>1. What we collect</h2>
      <p>When you use Painr, we collect minimal data:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Usage data:</strong> Number of analyses run (stored locally in your browser via localStorage). We do not track this on our servers.</li>
        <li><strong>Payment data:</strong> When you upgrade to Pro, Stripe processes your payment. We receive your email address and subscription status from Stripe. We do not store your credit card details.</li>
        <li><strong>Reddit data:</strong> Posts fetched from Reddit are processed in your browser and through our AI proxy. We do not store Reddit posts on our servers.</li>
      </ul>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>2. How we use your data</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>To provide the pain point analysis service</li>
        <li>To verify your Pro subscription status</li>
        <li>To improve the service</li>
      </ul>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>3. Third-party services</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Stripe:</strong> Payment processing. See <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>Stripe's Privacy Policy</a>.</li>
        <li><strong>Z.AI (Zhipu):</strong> AI analysis of Reddit posts. Post titles and excerpts are sent to their API for processing.</li>
        <li><strong>Reddit:</strong> Public posts are fetched via Reddit's public JSON API.</li>
        <li><strong>Vercel:</strong> Hosting and serverless functions. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>Vercel's Privacy Policy</a>.</li>
      </ul>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>4. Data retention</h2>
      <p>Session data and analysis results are stored only in your browser's localStorage. Clearing your browser data removes all stored sessions. We do not retain copies of your analyses on our servers.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>5. Your rights</h2>
      <p>You can delete all local data by clearing your browser storage. To cancel your Pro subscription or request deletion of payment data, contact us at the email below.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>6. Contact</h2>
      <p>Questions? Email <a href="mailto:hello@painr.app" style={{ color: '#a78bfa' }}>hello@painr.app</a></p>
    </div>
  );
}
