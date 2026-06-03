import { useState } from 'react';
import StandingsTab from '../components/StandingsTab';
import { useAppStore } from '../store/useAppStore';
import { TeamStats } from '../data/realTeamsData';

export default function StandingsPage() {
  const teams = useAppStore((s) => s.teams);
  const isTeamsLoading = useAppStore((s) => s.isTeamsLoading);
  const teamsSyncMsg = useAppStore((s) => s.teamsSyncMsg);
  const teamsSyncSource = useAppStore((s) => s.teamsSyncSource);
  const loadRealTimeStandings = useAppStore((s) => s.loadRealTimeStandings);
  const setTeams = useAppStore((s) => s.setTeams);
  const setTeamsSyncMsg = useAppStore((s) => s.setTeamsSyncMsg);
  const setTeamsSyncSource = useAppStore((s) => s.setTeamsSyncSource);
  const [activeStandingsLeague, setActiveStandingsLeague] = useState<string>('EPL');

  return (
    <StandingsTab
      activeStandingsLeague={activeStandingsLeague}
      setActiveStandingsLeague={setActiveStandingsLeague}
      teams={teams}
      isTeamsLoading={isTeamsLoading}
      teamsSyncMsg={teamsSyncMsg}
      teamsSyncSource={teamsSyncSource}
      loadRealTimeStandings={loadRealTimeStandings}
      onTeamsUpdate={setTeams}
      onSyncMsgUpdate={setTeamsSyncMsg}
      onSyncSourceUpdate={setTeamsSyncSource}
    />
  );
}
