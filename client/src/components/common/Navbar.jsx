/**
 * Navbar.jsx
 *
 * Header navigation bar for the Farmer dashboard and management screens.
 */

import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-green-700 text-white'
        : 'text-green-50 hover:bg-green-600 hover:text-white'
    }`;

  const mobileNavLinkClass = ({ isActive }) =>
    `block px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
      isActive
        ? 'bg-green-700 text-white'
        : 'text-green-100 hover:bg-green-600 hover:text-white'
    }`;

  return (
    <nav className="bg-green-600 border-b border-green-700 shadow-xs sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Desktop Navigation */}
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
              <span className="text-2xl">🌱</span>
              <span>Crop Health</span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-green-700 text-green-100 rounded-md">
                Farmer
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/fields" className={navLinkClass}>
                My Fields
              </NavLink>
              <NavLink to="/detections" className={navLinkClass}>
                Detection History
              </NavLink>
            </div>
          </div>

          {/* Right Action & User Profile */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/detections/new"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-green-700 hover:bg-green-50 font-semibold text-sm rounded-lg shadow-xs transition-colors"
            >
              <span>📷</span>
              <span>New Analysis</span>
            </Link>

            <div className="flex items-center gap-3 pl-3 border-l border-green-500/60">
              <div className="text-right">
                <p className="text-xs text-green-100 font-medium">Logged in as</p>
                <p className="text-sm text-white font-semibold leading-tight">{user?.name || 'Farmer'}</p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-green-100 hover:text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors cursor-pointer"
                title="Log out"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <Link
              to="/detections/new"
              className="px-2.5 py-1 bg-white text-green-700 text-xs font-bold rounded-lg shadow-xs"
            >
              📷 Analyze
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 text-green-100 hover:text-white hover:bg-green-700 rounded-lg focus:outline-hidden"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-green-700/95 border-t border-green-800 px-4 pt-2 pb-4 space-y-2">
          <NavLink
            to="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/fields"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            My Fields
          </NavLink>
          <NavLink
            to="/detections"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Detection History
          </NavLink>

          <div className="pt-3 border-t border-green-600 flex items-center justify-between text-white">
            <div>
              <p className="text-xs text-green-200">Farmer</p>
              <p className="text-sm font-semibold">{user?.name || 'Farmer'}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
