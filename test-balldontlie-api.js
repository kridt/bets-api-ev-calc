// Test script for Ball Don't Lie API connection
// Run with: node test-balldontlie-api.js

const API_KEY = '4ff9fe15-7d31-408f-9a08-401d207e193e';
const BASE_URL = 'https://api.balldontlie.io/v1';

async function testAPI() {
  console.log('[Basketball] Testing Ball Don\'t Lie API Connection...\n');

  try {
    // Test 1: Fetch teams
    console.log('Test 1: Fetching NBA teams...');
    const teamsResponse = await fetch(`${BASE_URL}/teams`, {
      headers: { 'Authorization': API_KEY }
    });

    if (!teamsResponse.ok) {
      throw new Error(`Teams API failed: ${teamsResponse.status} ${teamsResponse.statusText}`);
    }

    const teamsData = await teamsResponse.json();
    console.log(`[OK] Success! Found ${teamsData.data.length} teams`);
    console.log(`   Sample: ${teamsData.data[0].full_name} (${teamsData.data[0].abbreviation})\n`);

    // Test 2: Fetch players
    console.log('Test 2: Fetching players for Lakers (LAL)...');
    const lakersTeam = teamsData.data.find(t => t.abbreviation === 'LAL');

    const playersResponse = await fetch(`${BASE_URL}/players?team_ids[]=${lakersTeam.id}&per_page=5`, {
      headers: { 'Authorization': API_KEY }
    });

    if (!playersResponse.ok) {
      throw new Error(`Players API failed: ${playersResponse.status} ${playersResponse.statusText}`);
    }

    const playersData = await playersResponse.json();
    console.log(`[OK] Success! Found ${playersData.data.length} players`);
    playersData.data.forEach((p, i) => {
      console.log(`   ${i+1}. ${p.first_name} ${p.last_name} - #${p.jersey_number || 'N/A'}`);
    });
    console.log('');

    // Test 3: Fetch player stats (if available with your plan)
    console.log('Test 3: Fetching player stats...');
    const player = playersData.data[0];

    const statsResponse = await fetch(`${BASE_URL}/stats?seasons[]=2024&player_ids[]=${player.id}&per_page=5`, {
      headers: { 'Authorization': API_KEY }
    });

    if (!statsResponse.ok) {
      if (statsResponse.status === 403) {
        console.log('[WARNING] Player stats endpoint requires ALL-STAR tier or higher');
        console.log('   Your current plan may not include game statistics');
        console.log('   You can upgrade at: https://www.balldontlie.io/\n');
      } else {
        throw new Error(`Stats API failed: ${statsResponse.status} ${statsResponse.statusText}`);
      }
    } else {
      const statsData = await statsResponse.json();
      if (statsData.data.length === 0) {
        console.log('[WARNING] No stats available yet (season might not have started or limited data)');
      } else {
        console.log(`[OK] Success! Found ${statsData.data.length} games for ${player.first_name} ${player.last_name}`);
        const recentGame = statsData.data[0];
        console.log(`   Recent game: ${recentGame.pts} PTS, ${recentGame.reb} REB, ${recentGame.ast} AST`);
      }
    }

    console.log('\n[OK] API Connection Test Complete!');
    console.log('   Your Ball Dont Lie API key is working correctly.\n');

  } catch (error) {
    console.error('\n[ERROR] API Test Failed:');
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

testAPI();
