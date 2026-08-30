/**
 * RegisterPage.jsx
 *
 * Farmer registration page.
 * Strictly adheres to requirement: POST /api/auth/register returns no JWT.
 * Does not silently auto-login; provides success feedback and navigates to /login.
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import ErrorAlert from '../components/common/ErrorAlert';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    language: 'en',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 8) {
      setError({ message: 'Password must be at least 8 characters long.' });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError({ message: 'Passwords do not match.' });
      return;
    }

    setLoading(true);

    try {
      // Role is fixed to 'farmer' (public self-registration role per authValidator)
      await register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: 'farmer',
        language: formData.language,
      });

      // Navigate to /login with success feedback notice
      navigate('/login', {
        state: {
          registeredMessage: 'Registration successful! Please sign in with your email and password.',
        },
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 text-center sm:text-left">
        <h2 className="text-xl font-bold text-slate-900">Create a Farmer Account</h2>
        <p className="text-xs text-slate-500 mt-1">
          Register to manage your crops, upload photos for disease detection, and receive early warnings.
        </p>
      </div>

      {error && <ErrorAlert error={error} onDismiss={() => setError(null)} className="mb-5" />}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-slate-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="e.g. Ramesh Singh"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
            Email address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="ramesh@example.com"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        <div>
          <label htmlFor="language" className="block text-xs font-semibold text-slate-700 mb-1">
            Preferred Language
          </label>
          <select
            id="language"
            name="language"
            value={formData.language}
            onChange={handleChange}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
          </select>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">
            Password (min 8 characters) <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 mb-1">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-green-500 focus:bg-white transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center cursor-pointer mt-2"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-600">
          Already registered?{' '}
          <Link to="/login" className="font-bold text-green-700 hover:text-green-800 underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
