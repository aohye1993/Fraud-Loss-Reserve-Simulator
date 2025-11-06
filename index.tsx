import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  Filler,
  annotationPlugin
);

// --- UTILITY FUNCTIONS ---

// Box-Muller transform to get a normally distributed random number
const getNormalRandom = (mean: number, stdDev: number): number => {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * z;
};

// Currency formatter
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// --- SIMULATION LOGIC ---

interface SimulationParams {
  numSimulations: number;
  avgEvents: number;
  avgLoss: number;
  volatility: number;
}

interface SimulationResult {
  monthlyLosses: number[];
  mean: number;
  median: number;
  stdDev: number;
  percentiles: { [key: number]: number };
}

const runSimulation = (params: SimulationParams): SimulationResult => {
  const monthlyLosses: number[] = [];
  const lossStdDev = params.avgLoss * (params.volatility / 100);

  for (let i = 0; i < params.numSimulations; i++) {
    const numEvents = Math.round(Math.max(0, getNormalRandom(params.avgEvents, params.avgEvents * 0.2)));
    let totalLoss = 0;
    for (let j = 0; j < numEvents; j++) {
      totalLoss += Math.max(0, getNormalRandom(params.avgLoss, lossStdDev));
    }
    monthlyLosses.push(totalLoss);
  }

  monthlyLosses.sort((a, b) => a - b);

  const sum = monthlyLosses.reduce((acc, val) => acc + val, 0);
  const mean = sum / monthlyLosses.length;
  const median = monthlyLosses[Math.floor(monthlyLosses.length / 2)];
  
  const sqDiffs = monthlyLosses.map(val => Math.pow(val - mean, 2));
  const avgSqDiff = sqDiffs.reduce((acc, val) => acc + val, 0) / sqDiffs.length;
  const stdDev = Math.sqrt(avgSqDiff);

  const percentiles = {};
  for(let i=1; i<=99; i++){
    percentiles[i] = monthlyLosses[Math.floor(monthlyLosses.length * (i/100))];
  }
  percentiles[50] = median;


  return { monthlyLosses, mean, median, stdDev, percentiles };
};


// --- REACT COMPONENTS ---

const SCENARIOS = {
  baseline: { avgEvents: 150, avgLoss: 350, volatility: 40, name: 'Baseline' },
  holiday: { avgEvents: 300, avgLoss: 450, volatility: 60, name: 'High-Risk Holiday Season' },
  launch: { avgEvents: 200, avgLoss: 250, volatility: 80, name: 'New Product Launch' },
};

const Header = () => (
  <header>
    <h1>Fraud Loss Reserve Simulator</h1>
    <p>
      <strong>Problem:</strong> What’s the distribution of total fraud losses, and what reserve should Finance set so there’s at least a 90–95% chance it’s enough?
      <br/>
      <strong>For:</strong> Fraud/Risk, Finance/Controlling, Ops.
    </p>
  </header>
);

interface ControlsPanelProps {
  params: SimulationParams;
  setParams: React.Dispatch<React.SetStateAction<SimulationParams>>;
  confidenceLevel: number;
  setConfidenceLevel: React.Dispatch<React.SetStateAction<number>>;
  onRun: () => void;
  isLoading: boolean;
}

const ControlsPanel: React.FC<ControlsPanelProps> = ({ params, setParams, confidenceLevel, setConfidenceLevel, onRun, isLoading }) => {
  const handleParamChange = (field: keyof SimulationParams, value: number) => {
    setParams(prev => ({ ...prev, [field]: value }));
  };

  const handleScenarioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scenarioKey = e.target.value as keyof typeof SCENARIOS;
    if (scenarioKey && SCENARIOS[scenarioKey]) {
      const { avgEvents, avgLoss, volatility } = SCENARIOS[scenarioKey];
      setParams(prev => ({ ...prev, avgEvents, avgLoss, volatility }));
    }
  };

  return (
    <aside className="controls-panel">
      <h2>Simulation Controls</h2>
      <div className="control-group">
        <label htmlFor="scenario">Scenario</label>
        <select id="scenario" onChange={handleScenarioChange} aria-label="Select a pre-defined scenario">
          <option value="">Custom</option>
          {Object.entries(SCENARIOS).map(([key, value]) => (
            <option key={key} value={key}>{value.name}</option>
          ))}
        </select>
      </div>
      <div className="control-group">
        <label htmlFor="avgEvents">
          Avg. Fraud Events/Month <span className="value-display">{params.avgEvents}</span>
        </label>
        <input type="range" id="avgEvents" min="50" max="500" step="10" value={params.avgEvents} onChange={(e) => handleParamChange('avgEvents', +e.target.value)} aria-label="Average fraud events per month slider" />
      </div>
      <div className="control-group">
        <label htmlFor="avgLoss">
          Avg. Loss per Event ($) <span className="value-display">{formatCurrency(params.avgLoss)}</span>
        </label>
        <input type="range" id="avgLoss" min="100" max="1000" step="10" value={params.avgLoss} onChange={(e) => handleParamChange('avgLoss', +e.target.value)} aria-label="Average loss per event slider" />
      </div>
      <div className="control-group">
        <label htmlFor="volatility">
          Loss Volatility (%) <span className="value-display">{params.volatility}%</span>
        </label>
        <input type="range" id="volatility" min="10" max="100" step="5" value={params.volatility} onChange={(e) => handleParamChange('volatility', +e.target.value)} aria-label="Loss volatility slider"/>
      </div>
      <div className="control-group">
        <label htmlFor="confidence">
          Confidence Level <span className="value-display">{confidenceLevel}%</span>
        </label>
        <input type="range" id="confidence" min="80" max="99" step="1" value={confidenceLevel} onChange={(e) => setConfidenceLevel(+e.target.value)} aria-label="Confidence level slider" />
      </div>
      <button className="run-button" onClick={onRun} disabled={isLoading}>
        {isLoading ? 'Simulating...' : 'Run Simulation'}
      </button>
    </aside>
  );
};

interface DashboardProps {
  results: SimulationResult | null;
  confidenceLevel: number;
  volatility: number;
}

const Dashboard: React.FC<DashboardProps> = ({ results, confidenceLevel, volatility }) => {
  if (!results) {
    return (
      <main className="dashboard card">
        <p>Run a simulation to see the results.</p>
      </main>
    );
  }

  const { mean, median, stdDev, percentiles, monthlyLosses } = results;
  const recommendedReserve = percentiles[confidenceLevel] || percentiles[95];
  const p75 = percentiles[75] || 0;

  // Prepare chart data
  const min = Math.floor(Math.min(...monthlyLosses)/1000)*1000;
  const max = Math.ceil(Math.max(...monthlyLosses)/1000)*1000;
  const numBins = 50;
  const binWidth = (max - min) / numBins;
  const bins = Array(numBins).fill(0);
  const labels = Array(numBins).fill(0).map((_, i) => formatCurrency(min + i * binWidth));

  monthlyLosses.forEach(loss => {
    const binIndex = Math.min(Math.floor((loss - min) / binWidth), numBins - 1);
    bins[binIndex]++;
  });
  
  const chartData = {
    labels,
    datasets: [{
      label: 'Frequency',
      data: bins,
      backgroundColor: 'rgba(13, 110, 253, 0.6)',
      borderColor: 'rgba(13, 110, 253, 1)',
      borderWidth: 1,
    }]
  };
  
  const annotationLineIndex = Math.max(0, bins.findIndex((_, i) => min + i * binWidth >= recommendedReserve));

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: 'Distribution of Simulated Monthly Fraud Losses', font: { size: 16 } },
      annotation: {
        annotations: {
          line1: {
            type: 'line' as const,
            xMin: annotationLineIndex,
            xMax: annotationLineIndex,
            borderColor: 'rgb(220, 53, 69)',
            borderWidth: 2,
            borderDash: [6, 6],
            label: {
              content: `${confidenceLevel}% Confidence: ${formatCurrency(recommendedReserve)}`,
              enabled: true,
              position: 'start' as const,
              backgroundColor: 'rgba(220, 53, 69, 0.8)'
            }
          }
        }
      }
    },
    scales: {
      y: { title: { display: true, text: 'Number of Simulations (Frequency)' } },
      x: { title: { display: true, text: 'Total Monthly Loss' } }
    }
  };

  const riskLevel = volatility > 70 ? 'High' : volatility > 40 ? 'Medium' : 'Low';

  return (
    <main className="dashboard" aria-labelledby="dashboard-title">
      <div className="summary-cards">
        <div className="summary-card card">
          <h3>Average Monthly Loss</h3>
          <p className="value">{formatCurrency(mean)}</p>
        </div>
        <div className="summary-card card">
          <h3>Median Monthly Loss</h3>
          <p className="value">{formatCurrency(median)}</p>
        </div>
        <div className="summary-card card">
          <h3>75th Percentile</h3>
          <p className="value">{`${formatCurrency(p75)}`}</p>
        </div>
        <div className="summary-card card">
          <h3>Standard Deviation</h3>
          <p className="value">{formatCurrency(stdDev)}</p>
        </div>
      </div>

      <div className="card chart-container">
        <Bar options={chartOptions as any} data={chartData} />
      </div>

      <div className="card guidance">
        <div className="risk-indicator">
          <h3>Risk Level</h3>
          <span className={`risk-level risk-${riskLevel.toLowerCase()}`}>{riskLevel}</span>
        </div>
        <div className="recommendation">
          <h3>Decision Guidance</h3>
          <p>Recommended Monthly Reserve for <strong>{confidenceLevel}%</strong> confidence:</p>
          <p className="recommended-value">{formatCurrency(recommendedReserve)}</p>
          <h4>Actionable Insights:</h4>
          <ul>
            <li>This reserve supports staffing for high-value alerts up to this amount.</li>
            <li>Consider auto-holding transactions above {formatCurrency(mean + stdDev * 2)} to mitigate tail risk.</li>
            <li>Review thresholds if losses consistently exceed the 75th percentile ({formatCurrency(p75)}).</li>
          </ul>
        </div>
      </div>
    </main>
  );
};


const App = () => {
  const [params, setParams] = useState<SimulationParams>({
    numSimulations: 10000,
    ...SCENARIOS.baseline,
  });
  const [confidenceLevel, setConfidenceLevel] = useState<number>(95);
  const [results, setResults] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const handleRunSimulation = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      const simResults = runSimulation(params);
      setResults(simResults);
      setIsLoading(false);
    }, 50);
  }, [params]);
  
  useEffect(() => {
    handleRunSimulation();
  }, [handleRunSimulation]);

  return (
    <>
      <Header />
      <div className="container">
        <ControlsPanel 
          params={params} 
          setParams={setParams} 
          confidenceLevel={confidenceLevel}
          setConfidenceLevel={setConfidenceLevel}
          onRun={handleRunSimulation} 
          isLoading={isLoading}
        />
        {isLoading ? <div className="dashboard spinner-container"><div className="spinner"></div></div> : <Dashboard results={results} confidenceLevel={confidenceLevel} volatility={params.volatility}/>}
      </div>
    </>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
