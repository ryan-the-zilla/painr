export default function Terms() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: '-apple-system, system-ui, sans-serif', color: '#e5e5e5', background: '#0a0a0a', minHeight: '100vh', lineHeight: 1.7 }}>
      <a href="/" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: '0.85rem' }}>&larr; Terug naar Painr</a>
      <h1 style={{ fontSize: '1.8rem', marginTop: 16 }}>Terms of Service</h1>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>Last updated: March 28, 2026</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>1. Service description</h2>
      <p>Painr is a tool that analyzes public Reddit posts to identify user pain points, frustrations, and unmet needs. The service uses AI to categorize and summarize findings.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>2. Free and Pro plans</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Free:</strong> 3 analyses total. CSV export only.</li>
        <li><strong>Pro Monthly (&euro;19/month):</strong> Unlimited analyses, all export formats, AI summary. Cancel anytime.</li>
        <li><strong>Pro Lifetime (&euro;79 one-time):</strong> All Pro features, forever. No recurring charges.</li>
      </ul>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>3. Payments and refunds</h2>
      <p>Payments are processed by Stripe. Monthly subscriptions can be cancelled at any time and will remain active until the end of the billing period. Lifetime purchases are non-refundable after 14 days of purchase. Within 14 days, contact us for a full refund.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>Use the service to harass, stalk, or target individual Reddit users</li>
        <li>Resell or redistribute analysis results as a competing service</li>
        <li>Attempt to reverse-engineer or abuse the AI proxy</li>
        <li>Exceed reasonable usage limits that degrade service for others</li>
      </ul>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>5. Disclaimer</h2>
      <p>Painr is provided "as is" without warranty. AI analysis results may contain inaccuracies. Reddit data is publicly available and subject to Reddit's terms of service. We are not affiliated with Reddit.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>6. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, Painr shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>7. Changes to terms</h2>
      <p>We may update these terms from time to time. Continued use of the service constitutes acceptance of updated terms.</p>

      <h2 style={{ fontSize: '1.1rem', marginTop: 28 }}>8. Contact</h2>
      <p>Questions? Email <a href="mailto:hello@painr.app" style={{ color: '#a78bfa' }}>hello@painr.app</a></p>
    </div>
  );
}
