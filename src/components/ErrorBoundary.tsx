import React, { ErrorInfo, ReactNode } from 'react';
import { DojoLogo } from './DojoLogo';
import { RefreshCcw, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public state: State;

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRestart = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center select-none antialiased">
          <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center max-w-md w-full">
            <DojoLogo size={120} className="mb-8 shadow-2xl shadow-red-900/20" />
            
            <div className="flex items-center justify-center gap-2 mb-4 w-full">
              <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 animate-pulse shrink-0" />
              <h1 className="text-xl sm:text-2xl md:text-4xl font-black text-white uppercase tracking-tighter italic whitespace-nowrap">
                Application Error
              </h1>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 w-full backdrop-blur-sm shadow-xl">
              <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-4">
                The application encountered an unexpected issue and was forced to halt. 
                Don't worry, your data in the cloud is safe.
              </p>
              
              {this.state.error && (
                <div className="bg-black/50 rounded-lg p-3 border border-red-900/30 text-left">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Error Reason</p>
                  <p className="text-xs font-mono text-zinc-300 break-all leading-tight">
                    {this.state.error.message}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={this.handleRestart}
              className="group flex items-center justify-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-xl transition-all duration-200 shadow-2xl shadow-red-900/40 active:scale-95 cursor-pointer ring-1 ring-white/10 hover:ring-white/20"
            >
              <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
              <span>Restart Application</span>
            </button>
            
            <p className="mt-8 text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">
              Buckner Martial Arts Operational Matrix
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
