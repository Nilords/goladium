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
        </ul>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Purpose of Processing
        </h2>
        <p className="mb-4">
          The collected data is used solely to provide account access,
          prevent abuse and multi-accounting, and maintain platform security.
          We do not sell or share personal data.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Third-Party Services
        </h2>
        <p className="mb-4">
          We use Cloudflare Turnstile for bot protection.
          Cloudflare may process technical data such as IP addresses
          for security purposes.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          User Rights
        </h2>
        <p className="mb-4">
          Under applicable data protection laws (including GDPR),
          users may request access, correction, or deletion of their stored data.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-2 text-white">
          Contact
        </h2>
        <p className="mb-4">
          For data-related requests, contact:
          <br />
          goladiuminfo@gmail.com
        </p>

        <p className="mt-10 text-sm text-gray-500">
          © 2026 Goladium
        </p>
      </div>
    </div>
  );
}
