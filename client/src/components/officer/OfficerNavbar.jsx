/**
 * OfficerNavbar.jsx
 *
 * Header navigation bar for the Officer Dashboard and Map screens.
 */

import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

export default function OfficerNavbar() {
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
        ? 'bg-slate-800 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

  const mobileNavLinkClass = ({ isActive }) =>
    `block px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
      isActive
        ? 'bg-slate-800 text-white'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-900 border-b border-slate-800 shadow-xs sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Desktop Navigation */}
          <div className="flex items-center gap-8">
            <Link to="/officer/dashboard" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
              <span className="text-2xl">🌍</span>
              <span>Crop Health</span>
              <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-md">
                Surveillance
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-2">
              <NavLink to="/officer/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/officer/hotspots" className={navLinkClass}>
                Hotspots
              </NavLink>
              <NavLink to="/officer/map" className={navLinkClass}>
                Map
              </NavLink>
            </div>
          </div>

          {/* Right Action & User Profile */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-3 pl-3 border-l border-slate-700">
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium">Logged in as</p>
                <p className="text-sm text-white font-semibold leading-tight">{user?.name || 'Officer'}</p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title="Log out"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg focus:outline-hidden"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-slate-800 px-4 pt-2 pb-4 space-y-2">
          <NavLink
            to="/officer/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/officer/hotspots"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Hotspots
          </NavLink>
          <NavLink
            to="/officer/map"
            onClick={() => setMobileMenuOpen(false)}
            className={mobileNavLinkClass}
          >
            Map
          </NavLink>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-white">
            <div>
              <p className="text-xs text-slate-400">Officer</p>
              <p className="text-sm font-semibold">{user?.name || 'Officer'}</p>
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
