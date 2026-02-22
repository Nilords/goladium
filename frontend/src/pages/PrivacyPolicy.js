import React from "react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0b0f14] text-gray-300 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">
          Privacy Policy
        </h1>

        <p className="mb-4">
          Goladium is a browser-based simulation platform using virtual in-game currency only.
          No real money transactions take place on the platform.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Data Collection
        </h2>
        <p className="mb-4">
          We collect the following data:
        </p>
        <ul className="list-disc list-inside mb-4 space-y-1">
          <li>Username</li>
          <li>Hashed password</li>
          <li>IP address (for security and abuse prevention)</li>
          <li>Session authentication data</li>
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Purpose of Processing
        </h2>
        <p className="mb-4">
          The collected data is used solely to provide account access,
          prevent abuse and multi-accounting, maintain platform security,
          and ensure stable operation of the service.
          We do not sell or share personal data.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Legal Basis
        </h2>
        <p className="mb-4">
          Data processing is based on Article 6(1)(b) GDPR (performance of a contract)
          and Article 6(1)(f) GDPR (legitimate interest in maintaining security,
          preventing fraud, and protecting the platform).
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Cookies
        </h2>
        <p className="mb-4">
          Goladium uses a technically necessary session cookie
          (<strong>oauth_session</strong>) for authentication purposes.
          This cookie is required to maintain secure login sessions.
          It does not contain tracking or marketing information.
        </p>
        <p className="mb-4">
          The cookie is HTTP-only, secure, and used exclusively for account authentication.
          No tracking or analytics cookies are used on this platform.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Third-Party Services
        </h2>
        <p className="mb-4">
          We use Cloudflare Turnstile for bot protection.
          Cloudflare may process technical data such as IP addresses
          to prevent automated abuse.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Data Retention
        </h2>
        <p className="mb-4">
          Account data is stored for as long as the user account exists.
          Users may request deletion of their account and associated data at any time.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          User Rights
        </h2>
        <p className="mb-4">
          Under applicable data protection laws (including GDPR),
          users have the right to request access, correction,
          restriction of processing, or deletion of their stored data.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Contact
        </h2>
        <p className="mb-4">
          For data-related requests, contact:
          <br />
          goladiuminfo@gmail.com
        </p>
      </div>
    </div>
  );
}
