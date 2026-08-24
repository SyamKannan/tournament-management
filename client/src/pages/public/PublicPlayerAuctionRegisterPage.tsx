import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../services/api';
import type { Auction, Tournament, Organization, AuctionCategory, FootballPosition, CricketRole, CricketBattingStyle, CricketBowlingStyle } from '../../types';
import { 
  Gavel, CheckCircle2, 
  Share2, ArrowRight, Check
} from 'lucide-react';

export const PublicPlayerAuctionRegisterPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{
    auction: Auction;
    tournament: Tournament;
    organization: Organization;
    registered_players_count: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [photo, setPhoto] = useState('');
  const [age, setAge] = useState<number>(22);
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('Malappuram');
  const [sportCode, setSportCode] = useState<'football' | 'cricket'>('football');
  const [category, setCategory] = useState<AuctionCategory>('Category B');
  const [pastAchievements, setPastAchievements] = useState('');

  // Football fields
  const [footballPosition, setFootballPosition] = useState<FootballPosition>('Striker');
  const [footballFoot, setFootballFoot] = useState<'left' | 'right' | 'both'>('right');

  // Cricket fields
  const [cricketRole, setCricketRole] = useState<CricketRole>('All-rounder');
  const [cricketBattingStyle, setCricketBattingStyle] = useState<CricketBattingStyle>('Right Hand');
  const [cricketBowlingStyle, setCricketBowlingStyle] = useState<CricketBowlingStyle>('Medium Fast');

  useEffect(() => {
    const fetchAuctionInfo = async () => {
      try {
        setIsLoading(true);
        const res = await api.get(`/auctions/public/registration/${token || 'malappuram-7s-auction-2026'}`);
        setData(res);
        if (res.tournament?.sport_code) {
          setSportCode(res.tournament.sport_code);
        }
      } catch (err: any) {
        setError(err.message || 'Auction registration link not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuctionInfo();
  }, [token]);

  const handleSampleFill = () => {
    if (sportCode === 'football') {
      setFullName('Nahas K.P.');
      setMobile('+91 98471 66778');
      setEmail('nahas.player@gmail.com');
      setPhoto('https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80');
      setAge(23);
      setVillage('Nilambur');
      setDistrict('Malappuram');
      setCategory('Category A');
      setFootballPosition('Left Wing');
      setFootballFoot('left');
      setPastAchievements('Scored 12 goals in district sub-junior league. Fast dribbler and crosser.');
    } else {
      setFullName('Vishnu Das');
      setMobile('+91 94470 55443');
      setEmail('vishnu.player@gmail.com');
      setPhoto('https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80');
      setAge(24);
      setVillage('Kozhikode Town');
      setDistrict('Kozhikode');
      setCategory('Category A');
      setCricketRole('All-rounder');
      setCricketBattingStyle('Right Hand');
      setCricketBowlingStyle('Medium Fast');
      setPastAchievements('280 runs & 14 wickets in Division 1 championship 2025.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.post(`/auctions/public/registration/${token || 'malappuram-7s-auction-2026'}`, {
        full_name: fullName,
        mobile,
        email,
        photo: photo || (sportCode === 'football' 
          ? 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=200&auto=format&fit=crop&q=80'
          : 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=200&auto=format&fit=crop&q=80'),
        age,
        village,
        district,
        sport_code: sportCode,
        category,
        cricket_role: sportCode === 'cricket' ? cricketRole : undefined,
        cricket_batting_style: sportCode === 'cricket' ? cricketBattingStyle : undefined,
        cricket_bowling_style: sportCode === 'cricket' ? cricketBowlingStyle : undefined,
        football_position: sportCode === 'football' ? footballPosition : undefined,
        football_preferred_foot: sportCode === 'football' ? footballFoot : undefined,
        past_achievements: pastAchievements
      });

      setSuccessData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to submit auction registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-400">Loading Player Auction Registration...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center text-white">
        <div className="max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-xl font-black font-heading text-rose-400">Auction Link Not Found</h2>
          <p className="text-xs text-slate-400">{error}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const { auction, tournament, organization, registered_players_count } = data!;
  const isFootball = tournament.sport_code === 'football';

  // Find selected category base price
  const activeBasePrice = auction.base_prices?.find(c => c.category === category)?.price || 2500;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <Gavel className="w-6 h-6 text-amber-400" />
                </div>
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-widest">
                  PLAYER AUCTION REGISTRATION
                </span>
                <h1 className="text-xl sm:text-2xl font-black font-heading text-white mt-1">
                  {auction.title}
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={copyShareLink}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copied ? 'Link Copied!' : 'Share Form'}</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div>
              Organized by: <strong className="text-white">{organization.name}</strong> • {tournament.village}, {tournament.district}
            </div>
            <div className="flex items-center gap-4 font-semibold text-slate-300">
              <span>Pool Size: <strong className="text-emerald-400">{registered_players_count} Registered</strong></span>
              <span>Team Purse: <strong className="text-amber-400">₹{auction.team_purse.toLocaleString()}</strong></span>
            </div>
          </div>
        </div>

        {/* Success Confirmation Card */}
        {successData ? (
          <div className="p-8 rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-2xl font-black font-heading text-white">Registration Submitted Successfully!</h2>
              <p className="text-xs text-slate-300 mt-2 max-w-md mx-auto">
                {successData.message}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-left max-w-md mx-auto text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Player Name:</span>
                <strong className="text-white">{successData.player?.full_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Base Price Category:</span>
                <strong className="text-amber-400">{successData.player?.category} (₹{successData.player?.base_price?.toLocaleString()})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Role / Position:</span>
                <strong className="text-white">{successData.player?.football_position || successData.player?.cricket_role}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold uppercase text-[11px]">Under Review</span>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Link
                to={`/auction/${auction.id}`}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5"
              >
                <span>View Live Auction Arena</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Registration Form */
          <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white font-heading">
                Player Details & Base Price Category
              </h2>
              <button
                type="button"
                onClick={handleSampleFill}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 transition-colors"
              >
                ⚡ 1-Click Demo Fill
              </button>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Basic Info */}
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Shameer Babu"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mobile / WhatsApp *</label>
                <input
                  type="text"
                  placeholder="+91 98471 00000"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="player@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Age *</label>
                <input
                  type="number"
                  min="14"
                  max="50"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Village / Town *</label>
                <input
                  type="text"
                  placeholder="e.g. Nilambur"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">District *</label>
                <input
                  type="text"
                  placeholder="e.g. Malappuram"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
                />
              </div>
            </div>

            {/* Profile Photo URL */}
            <div className="text-xs">
              <label className="block text-slate-300 font-semibold mb-1">Profile Photo URL</label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/photo-..."
                value={photo}
                onChange={(e) => setPhoto(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
              />
            </div>

            {/* Base Price Category Selector */}
            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">
                Select Base Price Category:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(auction.base_prices || []).map(cat => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => setCategory(cat.category)}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      category === cat.category
                        ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">{cat.category}</div>
                    <div className="text-sm font-black font-mono text-amber-400 mt-1">₹{cat.price.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sport Specific Fields */}
            {isFootball ? (
              <div className="grid sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Primary Football Position *</label>
                  <select
                    value={footballPosition}
                    onChange={(e: any) => setFootballPosition(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="Striker">Striker (Forward)</option>
                    <option value="Left Wing">Left Wing</option>
                    <option value="Right Wing">Right Wing</option>
                    <option value="Attacking Midfielder">Attacking Midfielder</option>
                    <option value="Central Midfielder">Central Midfielder</option>
                    <option value="Defensive Midfielder">Defensive Midfielder</option>
                    <option value="Centre Back">Centre Back (Defender)</option>
                    <option value="Left Back">Left Back</option>
                    <option value="Right Back">Right Back</option>
                    <option value="Goalkeeper">Goalkeeper</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Preferred Foot</label>
                  <select
                    value={footballFoot}
                    onChange={(e: any) => setFootballFoot(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="right">Right Foot</option>
                    <option value="left">Left Foot</option>
                    <option value="both">Both Feet (Ambidextrous)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Cricket Role *</label>
                  <select
                    value={cricketRole}
                    onChange={(e: any) => setCricketRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="All-rounder">All-rounder</option>
                    <option value="Batter">Top Order Batter</option>
                    <option value="Bowler">Bowler</option>
                    <option value="Wicketkeeper">Wicketkeeper</option>
                    <option value="Wicketkeeper + Batter">Wicketkeeper + Batter</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Batting Style</label>
                  <select
                    value={cricketBattingStyle}
                    onChange={(e: any) => setCricketBattingStyle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="Right Hand">Right Hand</option>
                    <option value="Left Hand">Left Hand</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Bowling Style</label>
                  <select
                    value={cricketBowlingStyle}
                    onChange={(e: any) => setCricketBowlingStyle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold outline-none"
                  >
                    <option value="Medium Fast">Right-arm Medium Fast</option>
                    <option value="Fast">Right-arm Fast</option>
                    <option value="Off Spin">Right-arm Off Spin</option>
                    <option value="Leg Spin">Right-arm Leg Spin</option>
                    <option value="Left-arm Orthodox">Left-arm Orthodox Spin</option>
                    <option value="None">None (Pure Batter)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Achievements */}
            <div className="text-xs">
              <label className="block text-slate-300 font-semibold mb-1">Past Experience & Achievements</label>
              <textarea
                rows={2}
                placeholder="Mention past clubs played for, trophies won, high scores, or awards..."
                value={pastAchievements}
                onChange={(e) => setPastAchievements(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white outline-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Base Price: <strong className="text-amber-400 text-sm">₹{activeBasePrice.toLocaleString()}</strong>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all"
              >
                {isSubmitting ? 'Submitting Registration...' : 'Register for Player Auction'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
