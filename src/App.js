import React, { useState, useEffect, useRef } from 'react';
import Modal from 'react-modal';
import { ethers } from 'ethers';
import { sdk } from '@farcaster/miniapp-sdk';
import { WagmiProvider, useAccount, useConnect, useBalance, useReadContract, useWriteContract } from 'wagmi';
import { config } from './wagmiConfig';
import './App.css';

// Set app element for modal accessibility
Modal.setAppElement('#root');

const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "guess", "type": "string"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "placeBet",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "resolveBet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "getBet",
    "outputs": [
      {
        "components": [
          {"internalType": "address", "name": "user", "type": "address"},
          {"internalType": "string", "name": "guess", "type": "string"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"},
          {"internalType": "bytes1", "name": "targetByte", "type": "bytes1"},
          {"internalType": "bool", "name": "won", "type": "bool"},
          {"internalType": "uint256", "name": "reward", "type": "uint256"},
          {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
          {"internalType": "bool", "name": "resolved", "type": "bool"}
        ],
        "internalType": "struct GuessCounterGame.Bet",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "betCounter",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": false, "internalType": "string", "name": "guess", "type": "string"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "blockNumber", "type": "uint256"}
    ],
    "name": "BetPlaced",
    "type": "event"
  }
];

const ERC20_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"},
      {"name": "_spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  }
];

// Hardcoded values
const RPC_URL = "https://mainnet.base.org";
const CHAIN_ID = 8453;
const CONTRACT_ADDRESS = "0x64f82C34e8F0f023952977E3B74fc5370C425c34";
const TOKEN_ADDRESS = "0xaF0a8E5465D04Ec8e2F67028dD7BC04903F1E36a";
const CLAIM_CONTRACT_ADDRESS = "0xc3C033bb090a341330d5b30DAA80B9Deb1F6d120";
const EXPLORER_URL = "https://basescan.org";
const COOLDOWN = 1; // seconds
const BLOCK_WAIT_TIME = 4; // 2 blocks
const BASE_CHAIN_ID_HEX = "0x2105"; // 8453 in hex

const CLAIM_ABI = [
  {
    "inputs": [],
    "name": "claim",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const AppWrapper = () => (
  <WagmiProvider config={config}>
    <App />
  </WagmiProvider>
);

const App = () => {
  const [betAmount, setBetAmount] = useState(100.0);
  const [numBets, setNumBets] = useState(1);
  const [mode, setMode] = useState("1"); // 1: manual, 2: random
  const [guess, setGuess] = useState("0");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [balance, setBalance] = useState(0);
  const [contractBalance, setContractBalance] = useState(0);
  const [logs, setLogs] = useState([]);
  const [isBetting, setIsBetting] = useState(false);
  const stopRequestedRef = useRef(false);
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [visitorCount, setVisitorCount] = useState('?');
  const logsContainerRef = useRef(null);

  const { address: account, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const farcasterConnector = connectors.find(c => c.name === 'Farcaster Mini App');


  const { data: userBalanceData } = useBalance({
    address: account,
    token: TOKEN_ADDRESS,
    enabled: !!account,
  });
  const userBalanceFormatted = userBalanceData ? ethers.formatEther(userBalanceData.value) : '0';


  const { data: contractBalanceData } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [CONTRACT_ADDRESS],
    enabled: !!account,
  });
  const contractBalanceFormatted = contractBalanceData ? ethers.formatEther(contractBalanceData) : '0';

  const { writeContract } = useWriteContract();

  useEffect(() => {
    fetch('https://visitor.6developer.com/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'basebetgame.vercel.app',
      })
    })
      .then(res => res.json())
      .then(data => setVisitorCount(data.totalCount || '?'))
      .catch(() => setVisitorCount('?'));
  }, []);

  useEffect(() => {
    setBalance(userBalanceFormatted);
    setContractBalance(contractBalanceFormatted);
  }, [userBalanceFormatted, contractBalanceFormatted]);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const initializeSDK = async () => {
      try {
        await sdk.actions.ready();
        console.log('Farcaster Mini App SDK ready.');
      } catch (error) {
        console.error('Error initializing SDK:', error);
      }
    };
    initializeSDK();
  }, []);

  const addLog = (logEntry) => {
    setLogs(prev => [...prev, logEntry]);
  };

  const connectWithFarcaster = () => {
    if (farcasterConnector) {
      connect({ connector: farcasterConnector });
    } else {
      addLog({type: 'simple', message: 'Farcaster connector not available.'});
    }
  };

  const connectWithWallet = async (walletType) => {
    let ethereumProvider;
    let walletName = walletType.charAt(0).toUpperCase() + walletType.slice(1);

    if (walletType === 'metamask') {
      if (!window.ethereum || !window.ethereum.isMetaMask) {
        addLog({type: 'simple', message: "MetaMask not detected. Please install or enable it. If multiple wallets are installed, try disabling others temporarily."});
        return;
      }
      ethereumProvider = window.ethereum;
    } else if (walletType === 'okx') {
      if (!window.okxwallet) {
        addLog({type: 'simple', message: "OKX Wallet not detected. Please install or enable it."});
        return;
      }
      ethereumProvider = window.okxwallet;
    } else if (walletType === 'coinbase') {
      if (!window.coinbaseWalletExtension) {
        addLog({type: 'simple', message: "Coinbase Wallet not detected. Please install or enable it."});
        return;
      }
      ethereumProvider = window.coinbaseWalletExtension;
    } else {
      addLog({type: 'simple', message: "Unsupported wallet type."});
      return;
    }

    try {
      const accounts = await ethereumProvider.request({ method: 'eth_requestAccounts' });

      const newProvider = new ethers.BrowserProvider(ethereumProvider);
      const network = await newProvider.getNetwork();

      if (Number(network.chainId) !== CHAIN_ID) {
        addLog({type: 'simple', message: `Detected wallet: ${walletName}. Switching to Base...`});
        let switchSuccess = false;
        try {
          await ethereumProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_ID_HEX }],
          });
          switchSuccess = true;
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await ethereumProvider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: BASE_CHAIN_ID_HEX,
                  chainName: 'Base',
                  rpcUrls: [RPC_URL],
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  blockExplorerUrls: ['https://basescan.org/'],
                }],
              });
              addLog({type: 'simple', message: `Chain added to ${walletName}. Now switching...`});
              // After adding, try switching again
              await ethereumProvider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: BASE_CHAIN_ID_HEX }],
              });
              switchSuccess = true;
            } catch (addError) {
              addLog({type: 'simple', message: `Failed to add chain to ${walletName}: ${addError.message}`});
            }
          } else {
            addLog({type: 'simple', message: `Switch failed for ${walletName}: ${switchError.message}`});
          }
        }

        if (switchSuccess) {
          // Add a longer delay to allow the wallet to fully update after switch
          await new Promise(resolve => setTimeout(resolve, 2500));
        }

        const updatedNetwork = await newProvider.getNetwork();
        if (Number(updatedNetwork.chainId) !== CHAIN_ID) {
          addLog({type: 'simple', message: `Failed to switch to Base in ${walletName}. Please switch manually.`});
          addLog({type: 'simple', message: "Network details: Chain ID: 8453, RPC: https://mainnet.base.org, Symbol: ETH, Explorer: https://basescan.org"});
          // Proceed with connection but warn
          addLog({type: 'simple', message: "Connected anyway. Please switch network manually in wallet to use the app fully."});
        } else {
          addLog({type: 'simple', message: "Successfully switched to Base!"});
        }
      }

      const newSigner = await newProvider.getSigner();
      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
      addLog({type: 'simple', message: `Connected with ${walletName}: ${accounts[0]}`});

      // Force balance update after state settles
      setTimeout(() => {
        if (provider && account) {
          updateBalance();
          updateContractBalance();
        }
      }, 1000);
    } catch (error) {
      addLog({type: 'simple', message: `Connection failed: ${error.message}`});
    }
  };

  const claimTokens = async () => {
    if (!isConnected || !account) {
      addLog({type: 'simple', message: "Connect wallet first."});
      return;
    }
    try {

      writeContract({
        address: CLAIM_CONTRACT_ADDRESS,
        abi: CLAIM_ABI,
        functionName: 'claim',
        onSuccess: (hash) => {
          addLog({type: 'tx', message: `Claiming tokens... Tx: `, txHash: hash});
        },
        onError: (error) => addLog({type: 'simple', message: `Claim failed: ${error.message}`}),
      });
    } catch (error) {
      addLog({type: 'simple', message: `Claim failed: ${error.message}`});
    }
  };

  const approveToken = async () => {
    if (!isConnected || !account) return;

    try {
      const { data: allowance } = await useReadContract({
        address: TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, CONTRACT_ADDRESS],
      });

      const required = ethers.parseEther(betAmount.toString()) * BigInt(numBets);
      if (allowance < required) {
        writeContract({
          address: TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESS, ethers.MaxUint256],
          onSuccess: (hash) => addLog({type: 'tx', message: `Approving tokens... Tx: `, txHash: hash}),
          onError: (error) => addLog({type: 'simple', message: `Approval failed: ${error.message}`}),
        });
      }
    } catch (error) {
      addLog({type: 'simple', message: `Approval check failed: ${error.message}`});
    }
  };

  const placeBet = async (currentGuess) => {
    try {
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'placeBet',
        args: [currentGuess, ethers.parseEther(betAmount.toString())],
        onSuccess: (hash) => addLog({type: 'tx', message: `Placing bet... Tx: `, txHash: hash}),
        onError: (error) => addLog({type: 'simple', message: `Place bet failed: ${error.message}`}),
      });

    } catch (error) {
      addLog({type: 'simple', message: `Place bet failed: ${error.message}`});
    }
  };


  const shortenHash = (hash) => hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '';

  const possibleGuesses = '0123456789abcdef'.split('');

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Base Betting Game</h1>
        <p className="visitor-count">Welcome, you are the {visitorCount}th visitor</p>
      </header>
      <div className="wallet-buttons">
        <button className="connect-btn" onClick={() => connectWithWallet('metamask')}>
          Connect MetaMask
        </button>
        <button className="connect-btn" onClick={() => connectWithWallet('okx')}>
          Connect OKX
        </button>
        <button className="connect-btn" onClick={() => connectWithWallet('coinbase')}>
          Connect Coinbase
        </button>
        <button className="connect-btn" onClick={connectWithFarcaster}>
          Connect Farcaster Wallet
        </button>
      </div>
      {account && (
        <div className="account-info">
          <p>Account: {shortenHash(account)} Balance: {balance} GTK</p>
        </div>
      )}
      <div className="button-group">
        <button className="instructions-btn" onClick={() => setModalIsOpen(true)}>
          Instructions
        </button>
        <button className="claim-btn" onClick={claimTokens}>
          Claim Tokens
        </button>
        <div className="vault-info">
          Vault: {contractBalance} GTK
        </div>
      </div>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => setModalIsOpen(false)}
        className="modal-content"
        overlayClassName="modal-overlay"
      >
        <h2>Game Instructions</h2>
        <p>Guess the character value of the last digit in the block hash of the bet's block, choose from 0-9 or a-f.</p>
        <p>If correct, win 12 times the bet amount as reward; if incorrect, lose the bet amount.</p>
        <p>The transaction hash is not the block hash; a block can contain multiple transaction hashes.</p>
        <p>To ensure fairness, openness, and transparency, only the last digit of the block hash generated at the time of the bet is used.</p>
        <button className="close-btn" onClick={() => setModalIsOpen(false)}>
          Close
        </button>
      </Modal>

      <div className="betting-section">
        <div className="mode-selector">
          <label>Bet Mode:</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="1">Manual</option>
            <option value="2">Random</option>
          </select>
        </div>
        {mode === '1' && (
          <div className="guess-selector">
            <label>Guess:</label>
            <div className="guess-buttons">
              {possibleGuesses.map(g => (
                <button
                  key={g}
                  onClick={() => setGuess(g)}
                  className={`guess-btn ${guess === g ? 'active' : ''}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="input-row">
          <div className="input-group">
            <label>Bet Amount (GTK):</label>
            <input
              type="number"
              value={betAmount}
              onChange={e => setBetAmount(Number(e.target.value))}
              className="input-field"
            />
          </div>
          <div className="input-group">
            <label>Number of Bets:</label>
            <input
              type="number"
              value={numBets}
              onChange={e => setNumBets(Number(e.target.value))}
              className="input-field"
            />
          </div>
        </div>
        <div className="bet-buttons">
          <button onClick={startBetting} disabled={isBetting} className="start-btn">
            Start Betting
          </button>
          <button onClick={stopBetting} disabled={!isBetting} className="stop-btn">
            Stop Betting
          </button>
        </div>
      </div>

      <div className="logs-section">
        <h2>Bet Logs</h2>
        <div className="logs-container" ref={logsContainerRef}>
          {logs.map((log, i) => {
            if (log.type === 'simple') {
              return (
                <p key={i}>
                  {log.message}
                  {log.txHash && (
                    <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                      {shortenHash(log.txHash)}
                    </a>
                  )}
                </p>
              );
            } else if (log.type === 'tx') {
              return (
                <p key={i}>
                  {log.message}
                  <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {shortenHash(log.txHash)}
                  </a>
                </p>
              );
            } else if (log.type === 'betPlaced') {
              return (
                <p key={i}>
                  Bet placed. Bet ID: {log.betId}, Block: 
                  <a href={`${EXPLORER_URL}/block/${log.blockNumber}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {log.blockNumber}
                  </a>
                </p>
              );
            } else if (log.type === 'blockInfo') {
              return (
                <p key={i}>
                  Block: 
                  <a href={`${EXPLORER_URL}/block/${log.blockNumber}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {log.blockNumber}
                  </a>
                  Hash: 
                  <a href={`${EXPLORER_URL}/block/${log.blockHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                    {shortenHash(log.blockHash)}
                  </a>, Target Byte: {log.targetByte}
                </p>
              );
            } else if (log.type === 'result') {
              const className = log.won ? 'win-log' : 'lost-log';
              return (
                <p key={i} className={className}>
                  {log.won ? 'WOW! YOUR WIN!!!' : `Lost bet ${log.betId}.`}
                  {log.won && (
                    <>
                      <br />
                      Send {log.reward} token tx: 
                      <a href={`${EXPLORER_URL}/tx/${log.txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                        {shortenHash(log.txHash)}
                      </a>
                    </>
                  )}
                </p>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};

export default AppWrapper;
