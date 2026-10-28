import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, User, Check } from 'lucide-react';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { UserRole } from '../types';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSession: { role: UserRole; name: string } | null;
  isDatabaseActive?: boolean;
}

export function SuggestionModal({ isOpen, onClose, userSession, isDatabaseActive = true }: SuggestionModalProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const suggestionId = 'sug_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    
    // Automatically derive subject for validation security rules and blueprint expectations
    const plainContent = content.trim();
    const finalSubject = plainContent.substring(0, 60) + (plainContent.length > 60 ? '...' : '');
    
    const userName = userSession?.name || 'Anonymous User';
    const userRole = userSession?.role || 'Front Desk';

    try {
      if (isFirebaseConfigured && db && isDatabaseActive) {
        // Firestore direct save with temporal integrity
        const docRef = doc(db, 'suggestions', suggestionId);
        await setDoc(docRef, {
          id: suggestionId,
          subject: finalSubject,
          content: plainContent,
          userName,
          userRole,
          createdAt: serverTimestamp() // temporal integrity requirement
        });
      } else {
        // LocalStorage fallback
        const existingRaw = localStorage.getItem('bma_suggestions') || '[]';
        const suggestions = JSON.parse(existingRaw);
        suggestions.push({
          id: suggestionId,
          subject: finalSubject,
          content: plainContent,
          userName,
          userRole,
          createdAt: new Date().toISOString()
        });
        localStorage.setItem('bma_suggestions', JSON.stringify(suggestions));
      }

      setSubmitSuccess(true);
      setContent('');
      
      // Auto close after success feedback
      setTimeout(() => {
        setSubmitSuccess(false);
        onClose();
      }, 1800);

    } catch (error) {
      console.error('Failed to submit suggestion:', error);
      setErrorMessage('Could not record your suggestion. Please ensure database connection is active or try again.');
      try {
        handleFirestoreError(error, OperationType.WRITE, `suggestions/${suggestionId}`);
      } catch (e) {
        // Suppress nested throw after logging to keep UI operational
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Dialog Body */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl z-10"
          >
            {/* Header */}
            <div className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-red-950/30 border border-red-900/40 flex items-center justify-center text-red-500">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-zinc-100 font-black text-sm uppercase tracking-wider">Reporter Dashboard</h3>
                  <p className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-widest">Submit Feature Feedback</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 px-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition text-sm flex items-center gap-1 uppercase font-black tracking-widest cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline text-[9px]">Close</span>
              </button>
            </div>

            {/* Inner Content / Success Indicator */}
            <div className="p-5 font-sans">
              {submitSuccess ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center space-y-3"
                >
                  <div className="w-14 h-14 rounded-full bg-green-950/50 border border-green-500/30 flex items-center justify-center text-green-400 mb-2">
                    <Check className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">Suggestion Recorded!</h4>
                  <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                    Thank you! Your idea has been saved to the database. We use this direct feedback to continuously refine the Buckner Martial Arts experience.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Reporter Info Row */}
                  <div className="flex items-center justify-between text-[11px] font-mono bg-zinc-950 px-3.5 py-2.5 border border-zinc-800 rounded-xl mb-1 select-none text-zinc-400">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-red-500" />
                      <span>Operator: <b className="text-zinc-200">{userSession?.name || 'Local'}</b></span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-red-400 font-black uppercase text-[9px] tracking-wider">
                      {userSession?.role || 'Guest'}
                    </span>
                  </div>

                  {/* Body Text */}
                  <div className="space-y-1.5">
                    <label htmlFor="suggest-content" className="block text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider">
                      Detailed Description of Suggestion & Logic
                    </label>
                    <textarea
                      id="suggest-content"
                      required
                      rows={5}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500/50 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none placeholder-zinc-500 resize-none transition duration-150 leading-relaxed font-sans"
                    />
                  </div>

                  {errorMessage && (
                    <div className="text-[10px] font-bold text-red-400 uppercase tracking-wide bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
                      {errorMessage}
                    </div>
                  )}

                  {/* Form Actions Footer */}
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800 mt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white font-black text-[10px] uppercase rounded-lg tracking-wider transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !content.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-555 text-white font-black text-[10px] uppercase rounded-lg tracking-widest flex items-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-red-950/40"
                    >
                      {isSubmitting ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{isSubmitting ? 'Recording...' : 'Submit Suggestion'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
