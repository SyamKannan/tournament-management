import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => (
  <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
    <div className="max-w-md w-full text-center">
      <div className="text-6xl font-black font-heading text-emerald-400">404</div>
      <h1 className="mt-3 text-2xl font-black font-heading text-white">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">
        The link may be wrong, or the page may have been removed.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/" className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
          Go Home
        </Link>
        <Link to="/players" className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold">
          Find Player Stats
        </Link>
      </div>
    </div>
  </div>
);
