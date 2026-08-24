import { db } from '../db/database.js';
import { 
  Match, FootballMatchState, FootballEvent, FootballEventType,
  CricketMatchState, CricketDelivery, Standing
} from '../types.js';

export class ScoringEngine {
  /* =========================================================================
   * FOOTBALL ENGINE
   * ========================================================================= */
  
  public static getOrCreateFootballState(matchId: string): FootballMatchState {
    let state = db.football_matches.find(f => f.match_id === matchId);
    if (!state) {
      state = {
        id: 'fb_state_' + Date.now(),
        match_id: matchId,
        team_a_score: 0,
        team_b_score: 0,
        current_half: '1',
        match_minute: 0,
        is_timer_running: false,
        events: []
      };
      db.football_matches.push(state);
      db.save();
    }
    return state;
  }

  public static addFootballEvent(params: {
    matchId: string;
    teamId: string;
    playerId: string;
    eventType: FootballEventType;
    minute: number;
    assistPlayerId?: string;
    subInPlayerId?: string;
    subOutPlayerId?: string;
    extraInfo?: string;
  }): { state: FootballMatchState; event: FootballEvent } {
    const match = db.matches.find(m => m.id === params.matchId);
    if (!match) throw new Error('Match not found');

    const state = this.getOrCreateFootballState(params.matchId);
    const newEvent: FootballEvent = {
      id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      match_id: params.matchId,
      team_id: params.teamId,
      player_id: params.playerId,
      event_type: params.eventType,
      minute: params.minute,
      assist_player_id: params.assistPlayerId,
      sub_in_player_id: params.subInPlayerId,
      sub_out_player_id: params.subOutPlayerId,
      extra_info: params.extraInfo,
      created_at: new Date().toISOString()
    };

    state.events.push(newEvent);
    state.match_minute = params.minute;

    // Recalculate score
    if (params.eventType === 'goal' || params.eventType === 'penalty_goal') {
      if (params.teamId === match.team_a_id) {
        state.team_a_score += 1;
      } else {
        state.team_b_score += 1;
      }
    } else if (params.eventType === 'own_goal') {
      // Own goal awards goal to opposing team
      if (params.teamId === match.team_a_id) {
        state.team_b_score += 1;
      } else {
        state.team_a_score += 1;
      }
    }

    if (match.status === 'scheduled' || match.status === 'toss') {
      match.status = 'in_progress';
    }

    // Auto-sync player career statistics
    if (params.playerId) {
      const pStats = db.player_stats.find(s => s.player_id === params.playerId);
      if (pStats && pStats.football) {
        if (params.eventType === 'goal' || params.eventType === 'penalty_goal') pStats.football.goals += 1;
        if (params.eventType === 'yellow_card') pStats.football.yellow_cards += 1;
        if (params.eventType === 'red_card') pStats.football.red_cards += 1;
      }
    }
    if (params.assistPlayerId) {
      const aStats = db.player_stats.find(s => s.player_id === params.assistPlayerId);
      if (aStats && aStats.football) aStats.football.assists += 1;
    }

    this.recalculateFootballStandings(match.tournament_id);
    db.save();
    return { state, event: newEvent };
  }

  public static undoLastFootballEvent(matchId: string): FootballMatchState {
    const match = db.matches.find(m => m.id === matchId);
    const state = this.getOrCreateFootballState(matchId);
    if (state.events.length === 0) return state;

    const lastEvent = state.events.pop()!;
    if (lastEvent.event_type === 'goal' || lastEvent.event_type === 'penalty_goal') {
      if (lastEvent.team_id === match?.team_a_id) {
        state.team_a_score = Math.max(0, state.team_a_score - 1);
      } else {
        state.team_b_score = Math.max(0, state.team_b_score - 1);
      }
    } else if (lastEvent.event_type === 'own_goal') {
      if (lastEvent.team_id === match?.team_a_id) {
        state.team_b_score = Math.max(0, state.team_b_score - 1);
      } else {
        state.team_a_score = Math.max(0, state.team_a_score - 1);
      }
    }

    if (match) {
      this.recalculateFootballStandings(match.tournament_id);
    }
    db.save();
    return state;
  }

  public static updateFootballTimer(matchId: string, action: 'start' | 'pause' | 'set_half' | 'set_minute' | 'finish', payload?: any): FootballMatchState {
    const match = db.matches.find(m => m.id === matchId);
    const state = this.getOrCreateFootballState(matchId);

    if (action === 'start') {
      state.is_timer_running = true;
      state.timer_started_at_epoch = Date.now();
      if (match && match.status !== 'in_progress') match.status = 'in_progress';
    } else if (action === 'pause') {
      state.is_timer_running = false;
      state.timer_started_at_epoch = undefined;
    } else if (action === 'set_half') {
      state.current_half = payload.half;
      if (payload.half === 'full_time' && match) {
        match.status = 'completed';
        state.is_timer_running = false;
        // determine winner
        if (state.team_a_score > state.team_b_score) {
          match.winner_team_id = match.team_a_id;
          match.result_summary = `Team A won ${state.team_a_score} - ${state.team_b_score}`;
        } else if (state.team_b_score > state.team_a_score) {
          match.winner_team_id = match.team_b_id;
          match.result_summary = `Team B won ${state.team_b_score} - ${state.team_a_score}`;
        } else {
          match.winner_team_id = undefined;
          match.result_summary = `Match Drawn ${state.team_a_score} - ${state.team_b_score}`;
        }
      }
    } else if (action === 'set_minute') {
      state.match_minute = payload.minute;
    } else if (action === 'finish' && match) {
      match.status = 'completed';
      state.is_timer_running = false;
      state.current_half = 'full_time';
      if (state.team_a_score > state.team_b_score) match.winner_team_id = match.team_a_id;
      else if (state.team_b_score > state.team_a_score) match.winner_team_id = match.team_b_id;
    }

    if (match) this.recalculateFootballStandings(match.tournament_id);
    db.save();
    return state;
  }

  public static recalculateFootballStandings(tournamentId: string) {
    const tournament = db.tournaments.find(t => t.id === tournamentId);
    if (!tournament || tournament.sport_code !== 'football') return;

    const teams = db.teams.filter(t => t.tournament_id === tournamentId && t.status === 'approved');
    const matches = db.matches.filter(m => m.tournament_id === tournamentId);

    teams.forEach(team => {
      let played = 0, won = 0, drawn = 0, lost = 0, gf = 0, ga = 0, points = 0;
      const form: string[] = [];

      matches.forEach(m => {
        const fb = db.football_matches.find(f => f.match_id === m.id);
        if (!fb || (m.team_a_id !== team.id && m.team_b_id !== team.id)) return;

        // Count if match is in progress or completed
        if (m.status === 'in_progress' || m.status === 'completed' || m.status === 'half_time') {
          played++;
          const isTeamA = m.team_a_id === team.id;
          const myGoals = isTeamA ? fb.team_a_score : fb.team_b_score;
          const oppGoals = isTeamA ? fb.team_b_score : fb.team_a_score;

          gf += myGoals;
          ga += oppGoals;

          if (myGoals > oppGoals) {
            won++;
            points += 3;
            form.push('W');
          } else if (myGoals === oppGoals) {
            drawn++;
            points += 1;
            form.push('D');
          } else {
            lost++;
            form.push('L');
          }
        }
      });

      const gd = gf - ga;
      let std = db.standings.find(s => s.tournament_id === tournamentId && s.team_id === team.id);
      if (!std) {
        std = {
          id: 'std_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          tournament_id: tournamentId,
          organization_id: tournament.organization_id,
          team_id: team.id,
          group_name: team.group_name || 'Group A',
          played, won, drawn, lost, no_result: 0,
          goals_for: gf, goals_against: ga, goal_difference: gd,
          runs_scored: 0, overs_faced: 0, runs_conceded: 0, overs_bowled: 0, net_run_rate: 0,
          points, form: form.slice(-5), rank: 1
        };
        db.standings.push(std);
      } else {
        std.played = played;
        std.won = won;
        std.drawn = drawn;
        std.lost = lost;
        std.goals_for = gf;
        std.goals_against = ga;
        std.goal_difference = gd;
        std.points = points;
        std.form = form.slice(-5);
      }
    });

    // Update ranks
    const tourneyStandings = db.standings.filter(s => s.tournament_id === tournamentId);
    tourneyStandings.sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);
    tourneyStandings.forEach((s, idx) => {
      s.rank = idx + 1;
    });
  }

  /* =========================================================================
   * CRICKET ENGINE
   * ========================================================================= */

  public static getOrCreateCricketState(matchId: string): CricketMatchState {
    let state = db.cricket_matches.find(c => c.match_id === matchId);
    const match = db.matches.find(m => m.id === matchId);
    if (!state && match) {
      state = {
        id: 'crick_state_' + Date.now(),
        match_id: matchId,
        total_overs: 20,
        current_innings: 1,
        batting_team_id: match.team_a_id,
        bowling_team_id: match.team_b_id,
        team_a_runs: 0,
        team_a_wickets: 0,
        team_a_overs: 0,
        team_b_runs: 0,
        team_b_wickets: 0,
        team_b_overs: 0,
        current_run_rate: 0,
        deliveries: []
      };
      db.cricket_matches.push(state);
      db.save();
    }
    return state!;
  }

  public static recordCricketBall(params: {
    matchId: string;
    innings: 1 | 2;
    runsScored: number;
    extras: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'none';
    extrasRuns?: number;
    isWicket: boolean;
    wicketType?: 'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped' | 'hit_wicket' | 'caught_and_bowled' | 'retired_hurt' | 'obstructing_field';
    dismissedPlayerId?: string;
    fielderId?: string;
    commentary?: string;
    nextStrikerId?: string;
    strikerId?: string;
    nonStrikerId?: string;
    bowlerId?: string;
  }): { state: CricketMatchState; delivery: CricketDelivery } {
    const match = db.matches.find(m => m.id === params.matchId);
    if (!match) throw new Error('Match not found');
    const state = this.getOrCreateCricketState(params.matchId);

    if (params.strikerId) state.current_striker_id = params.strikerId;
    if (params.nonStrikerId) state.current_non_striker_id = params.nonStrikerId;
    if (params.bowlerId) state.current_bowler_id = params.bowlerId;

    const isLegalBall = params.extras !== 'wide' && params.extras !== 'no_ball';
    const totalDeliveryRuns = params.runsScored + (params.extrasRuns ?? (params.extras !== 'none' ? 1 : 0));

    // Calculate current over and ball
    const currentInningsDeliveries = state.deliveries.filter(d => d.innings === params.innings);
    const legalBallsInCurrentInnings = currentInningsDeliveries.filter(d => d.extras !== 'wide' && d.extras !== 'no_ball').length;
    
    const currentOver = Math.floor(legalBallsInCurrentInnings / 6);
    const ballInOver = (legalBallsInCurrentInnings % 6) + (isLegalBall ? 1 : 0);

    const delivery: CricketDelivery = {
      id: 'del_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      match_id: params.matchId,
      innings: params.innings,
      over_number: currentOver,
      ball_number: ballInOver,
      bowler_id: state.current_bowler_id || 'bowler',
      striker_id: state.current_striker_id || 'striker',
      non_striker_id: state.current_non_striker_id || 'non_striker',
      runs_scored: params.runsScored,
      extras: params.extras,
      extras_runs: params.extrasRuns ?? (params.extras !== 'none' ? 1 : 0),
      is_wicket: params.isWicket,
      wicket_type: params.wicketType,
      dismissed_player_id: params.dismissedPlayerId,
      fielder_id: params.fielderId,
      commentary: params.commentary,
      created_at: new Date().toISOString()
    };

    state.deliveries.push(delivery);

    // Update Runs and Wickets for the Batting Team
    if (params.innings === 1) {
      state.team_a_runs += totalDeliveryRuns;
      if (params.isWicket) state.team_a_wickets += 1;
      const totalLegal = legalBallsInCurrentInnings + (isLegalBall ? 1 : 0);
      state.team_a_overs = parseFloat(`${Math.floor(totalLegal / 6)}.${totalLegal % 6}`);
      const oversDec = Math.floor(totalLegal / 6) + (totalLegal % 6) / 6;
      state.current_run_rate = oversDec > 0 ? parseFloat((state.team_a_runs / oversDec).toFixed(2)) : 0;
    } else {
      state.team_b_runs += totalDeliveryRuns;
      if (params.isWicket) state.team_b_wickets += 1;
      const totalLegal = legalBallsInCurrentInnings + (isLegalBall ? 1 : 0);
      state.team_b_overs = parseFloat(`${Math.floor(totalLegal / 6)}.${totalLegal % 6}`);
      const oversDec = Math.floor(totalLegal / 6) + (totalLegal % 6) / 6;
      state.current_run_rate = oversDec > 0 ? parseFloat((state.team_b_runs / oversDec).toFixed(2)) : 0;

      if (state.target_runs) {
        const runsRemaining = state.target_runs - state.team_b_runs;
        const totalBallsRemaining = Math.max(0, state.total_overs * 6 - totalLegal);
        const oversRemaining = totalBallsRemaining / 6;
        state.required_run_rate = oversRemaining > 0 && runsRemaining > 0 ? parseFloat((runsRemaining / oversRemaining).toFixed(2)) : 0;
        
        // Check match win
        if (state.team_b_runs >= state.target_runs) {
          match.status = 'completed';
          match.winner_team_id = state.batting_team_id;
          match.result_summary = `${db.teams.find(t => t.id === state.batting_team_id)?.name || 'Batting Team'} won by ${10 - state.team_b_wickets} wickets!`;
        }
      }
    }

    // Strike rotation on odd runs (1, 3, 5)
    if (params.runsScored % 2 === 1 && !params.isWicket) {
      const prevStriker = state.current_striker_id;
      state.current_striker_id = state.current_non_striker_id;
      state.current_non_striker_id = prevStriker;
    }

    // If over complete (6 legal balls), rotate strike
    const totalLegalAfter = legalBallsInCurrentInnings + (isLegalBall ? 1 : 0);
    if (isLegalBall && totalLegalAfter % 6 === 0) {
      const prevStriker = state.current_striker_id;
      state.current_striker_id = state.current_non_striker_id;
      state.current_non_striker_id = prevStriker;
    }

    // If new batsman came after wicket
    if (params.isWicket && params.nextStrikerId) {
      state.current_striker_id = params.nextStrikerId;
    }

    // Auto-sync player career statistics
    const isLegalBallForStats = params.extras !== 'wide' && params.extras !== 'no_ball';
    const totalRunsThisBall = params.runsScored + (params.extrasRuns || (params.extras === 'wide' || params.extras === 'no_ball' ? 1 : 0));

    if (params.strikerId) {
      const sStats = db.player_stats.find(s => s.player_id === params.strikerId);
      if (sStats && sStats.cricket) {
        sStats.cricket.runs_scored += params.runsScored;
        if (isLegalBallForStats) sStats.cricket.balls_faced += 1;
        if (params.runsScored === 4) sStats.cricket.fours += 1;
        if (params.runsScored === 6) sStats.cricket.sixes += 1;
      }
    }
    if (params.bowlerId) {
      const bStats = db.player_stats.find(s => s.player_id === params.bowlerId);
      if (bStats && bStats.cricket) {
        bStats.cricket.runs_conceded += totalRunsThisBall;
        if (params.isWicket && params.wicketType !== 'run_out') bStats.cricket.wickets_taken += 1;
      }
    }

    if (match.status === 'scheduled' || match.status === 'toss') {
      match.status = 'in_progress';
    }

    this.recalculateCricketStandings(match.tournament_id);
    db.save();
    return { state, delivery };
  }

  public static undoLastCricketBall(matchId: string): CricketMatchState {
    const match = db.matches.find(m => m.id === matchId);
    const state = this.getOrCreateCricketState(matchId);
    if (state.deliveries.length === 0) return state;

    const last = state.deliveries.pop()!;
    const totalDeliveryRuns = last.runs_scored + (last.extras_runs || 0);

    if (last.innings === 1) {
      state.team_a_runs = Math.max(0, state.team_a_runs - totalDeliveryRuns);
      if (last.is_wicket) state.team_a_wickets = Math.max(0, state.team_a_wickets - 1);
      const legalCount = state.deliveries.filter(d => d.innings === 1 && d.extras !== 'wide' && d.extras !== 'no_ball').length;
      state.team_a_overs = parseFloat(`${Math.floor(legalCount / 6)}.${legalCount % 6}`);
    } else {
      state.team_b_runs = Math.max(0, state.team_b_runs - totalDeliveryRuns);
      if (last.is_wicket) state.team_b_wickets = Math.max(0, state.team_b_wickets - 1);
      const legalCount = state.deliveries.filter(d => d.innings === 2 && d.extras !== 'wide' && d.extras !== 'no_ball').length;
      state.team_b_overs = parseFloat(`${Math.floor(legalCount / 6)}.${legalCount % 6}`);
    }

    if (match) this.recalculateCricketStandings(match.tournament_id);
    db.save();
    return state;
  }

  public static switchCricketInnings(matchId: string): CricketMatchState {
    const match = db.matches.find(m => m.id === matchId);
    const state = this.getOrCreateCricketState(matchId);
    if (!match) throw new Error('Match not found');

    state.current_innings = 2;
    state.target_runs = state.team_a_runs + 1;
    // Swap batting and bowling team
    const prevBatting = state.batting_team_id;
    state.batting_team_id = state.bowling_team_id;
    state.bowling_team_id = prevBatting;
    state.current_striker_id = undefined;
    state.current_non_striker_id = undefined;
    state.current_bowler_id = undefined;

    match.status = 'innings_break';
    db.save();
    return state;
  }

  public static recalculateCricketStandings(tournamentId: string) {
    const tournament = db.tournaments.find(t => t.id === tournamentId);
    if (!tournament || tournament.sport_code !== 'cricket') return;

    const teams = db.teams.filter(t => t.tournament_id === tournamentId && t.status === 'approved');
    const matches = db.matches.filter(m => m.tournament_id === tournamentId);

    teams.forEach(team => {
      let played = 0, won = 0, lost = 0, nr = 0, points = 0;
      let totalRunsScored = 0, totalOversFaced = 0, totalRunsConceded = 0, totalOversBowled = 0;
      const form: string[] = [];

      matches.forEach(m => {
        const crick = db.cricket_matches.find(c => c.match_id === m.id);
        if (!crick || (m.team_a_id !== team.id && m.team_b_id !== team.id)) return;

        if (m.status === 'in_progress' || m.status === 'completed' || m.status === 'innings_break') {
          played++;
          const isTeamA = m.team_a_id === team.id;
          const myRuns = isTeamA ? crick.team_a_runs : crick.team_b_runs;
          const myOvers = isTeamA ? crick.team_a_overs : crick.team_b_overs;
          const oppRuns = isTeamA ? crick.team_b_runs : crick.team_a_runs;
          const oppOvers = isTeamA ? crick.team_b_overs : crick.team_a_overs;

          totalRunsScored += myRuns;
          totalOversFaced += myOvers;
          totalRunsConceded += oppRuns;
          totalOversBowled += oppOvers;

          if (m.winner_team_id === team.id) {
            won++;
            points += 2;
            form.push('W');
          } else if (m.winner_team_id && m.winner_team_id !== team.id) {
            lost++;
            form.push('L');
          } else if ((m.status as any) === 'abandoned' || (m.status as any) === 'cancelled') {
            nr++;
            points += 1;
            form.push('NR');
          }
        }
      });

      // Calculate Net Run Rate (NRR)
      const batRate = totalOversFaced > 0 ? totalRunsScored / totalOversFaced : 0;
      const bowlRate = totalOversBowled > 0 ? totalRunsConceded / totalOversBowled : 0;
      const nrr = parseFloat((batRate - bowlRate).toFixed(3));

      let std = db.standings.find(s => s.tournament_id === tournamentId && s.team_id === team.id);
      if (!std) {
        std = {
          id: 'std_crick_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          tournament_id: tournamentId,
          organization_id: tournament.organization_id,
          team_id: team.id,
          played, won, drawn: 0, lost, no_result: nr,
          goals_for: 0, goals_against: 0, goal_difference: 0,
          runs_scored: totalRunsScored, overs_faced: totalOversFaced,
          runs_conceded: totalRunsConceded, overs_bowled: totalOversBowled,
          net_run_rate: nrr, points, form: form.slice(-5), rank: 1
        };
        db.standings.push(std);
      } else {
        std.played = played;
        std.won = won;
        std.lost = lost;
        std.no_result = nr;
        std.runs_scored = totalRunsScored;
        std.overs_faced = totalOversFaced;
        std.runs_conceded = totalRunsConceded;
        std.overs_bowled = totalOversBowled;
        std.net_run_rate = nrr;
        std.points = points;
        std.form = form.slice(-5);
      }
    });

    // Sort cricket standings by points and then NRR
    const tourneyStandings = db.standings.filter(s => s.tournament_id === tournamentId);
    tourneyStandings.sort((a, b) => b.points - a.points || b.net_run_rate - a.net_run_rate);
    tourneyStandings.forEach((s, idx) => {
      s.rank = idx + 1;
    });
  }
}
