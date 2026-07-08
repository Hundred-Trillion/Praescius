'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/utils/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User, GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [coupon, setCoupon] = useState('');
  const [tier, setTier] = useState('FREE');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchTier(currentUser.uid);
      } else {
        setTier('FREE');
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchTier = async (userId: string) => {
    try {
      const docRef = doc(db, 'subscriptions', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setTier(docSnap.data().tier || 'FREE');
      } else {
        setTier('FREE');
      }
    } catch (error: any) {
      console.error("Error fetching tier:", error);
      // Fallback to FREE if Firestore is not yet initialized in the console
      setTier('FREE');
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Initialize free tier in Firestore
      await setDoc(doc(db, 'subscriptions', userCredential.user.uid), { tier: 'FREE', createdAt: new Date() });
      setMessage('Account created successfully!');
    } catch (error: any) {
      setMessage(error.message);
    }
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setMessage('Logged in successfully!');
    } catch (error: any) {
      setMessage(error.message);
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      // Initialize free tier if it doesn't exist
      const docRef = doc(db, 'subscriptions', result.user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { tier: 'FREE', createdAt: new Date() });
      }
      setMessage('Logged in with Google!');
    } catch (error: any) {
      setMessage(error.message);
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      const provider = new OAuthProvider('apple.com');
      const result = await signInWithPopup(auth, provider);
      const docRef = doc(db, 'subscriptions', result.user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        await setDoc(docRef, { tier: 'FREE', createdAt: new Date() });
      }
      setMessage('Logged in with Apple!');
    } catch (error: any) {
      setMessage(error.message);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMessage('');
  };

  const handleRedeemCoupon = async () => {
    if (!user) return setMessage('Please login first');
    setLoading(true);
    let targetTier = 'FREE';
    if (coupon.toUpperCase() === 'BETAPRO') targetTier = 'PRO';
    else if (coupon.toUpperCase() === 'BETAULTRA') targetTier = 'ULTRA';
    else {
      setMessage('Invalid coupon code');
      setLoading(false);
      return;
    }

    try {
      await setDoc(doc(db, 'subscriptions', user.uid), { 
        tier: targetTier, 
        updatedAt: new Date() 
      }, { merge: true });
      
      setTier(targetTier);
      setMessage(`Success! Upgraded to ${targetTier}`);
    } catch (error: any) {
      setMessage(`Redemption failed: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white p-10 font-sans selection:bg-rose-500 selection:text-white">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-16 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-wider text-yellow-400 drop-shadow-[2px_2px_0_#000]">Praescius</h1>
            <span className="text-xs font-black tracking-[0.2em] text-white bg-black px-2 py-1">BY NANDURI LABS</span>
          </div>
          {user && (
            <button onClick={handleLogout} className="text-sm font-bold bg-neutral-800 px-4 py-2 hover:bg-neutral-700 transition">
              Logout
            </button>
          )}
        </header>

        {!user ? (
          <div className="bg-neutral-800 p-8 border-4 border-black shadow-[8px_8px_0_0_#000]">
            <h2 className="text-2xl font-black uppercase mb-6 text-yellow-400 drop-shadow-[2px_2px_0_#000]">Access Portal</h2>
            <div className="flex flex-col gap-4">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-neutral-900 border-2 border-black p-3 text-sm font-bold focus:outline-none focus:border-yellow-400 transition" />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-neutral-900 border-2 border-black p-3 text-sm font-bold focus:outline-none focus:border-yellow-400 transition" />
              <div className="flex gap-4 mt-2">
                <button onClick={handleSignIn} disabled={loading} className="flex-1 bg-yellow-400 text-black border-2 border-black font-black p-3 shadow-[4px_4px_0_0_#000] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition uppercase text-sm disabled:opacity-50">Log In</button>
                <button onClick={handleSignUp} disabled={loading} className="flex-1 bg-white text-black border-2 border-black font-black p-3 shadow-[4px_4px_0_0_#000] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition uppercase text-sm disabled:opacity-50">Sign Up</button>
              </div>
              
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-neutral-700"></div>
                <span className="flex-shrink-0 mx-4 text-neutral-500 text-xs font-bold uppercase tracking-wider">Or continue with</span>
                <div className="flex-grow border-t border-neutral-700"></div>
              </div>

              <div className="flex gap-4">
                <button onClick={handleGoogleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 bg-white text-black border-2 border-black font-black p-3 shadow-[4px_4px_0_0_#000] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition uppercase text-sm disabled:opacity-50">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </button>
                <button onClick={handleAppleSignIn} disabled={loading} className="flex-1 flex items-center justify-center gap-2 bg-black text-white border-2 border-black font-black p-3 shadow-[4px_4px_0_0_#fff] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#fff] transition uppercase text-sm disabled:opacity-50">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M16.365 21.432c-1.317.91-2.585 1.545-3.834 1.545-1.282 0-2.482-.6-3.804-1.554-1.299-.94-2.566-1.571-3.804-1.571-.059 0-.117.004-.176.012-3.154.425-4.482 3.864-4.551 4.053-.08.219-.072.46.022.671.094.212.274.375.496.449 2.062.695 3.332 2.129 3.877 4.382.092.383.332.709.67.91.339.2.738.243 1.114.12 3.197-1.047 6.643 2.115 6.745 2.213.19.183.455.263.712.216.257-.046.48-.198.599-.408 1.455-2.569 2.125-5.32 2.125-8.736 0-4.004-1.745-6.883-4.241-8.302M12 1.992c-1.317 0-2.585.635-3.834 1.545-1.282.954-2.482 1.554-3.804 1.554-.059 0-.117-.004-.176-.012-3.154-.425-4.482-3.864-4.551-4.053-.08-.219-.072-.46.022-.671.094-.212.274-.375.496-.449 2.062-.695 3.332-2.129 3.877-4.382.092-.383.332-.709.67-.91.339-.2.738-.243 1.114-.12 3.197 1.047 6.643-2.115 6.745-2.213.19-.183.455-.263.712-.216.257.046.48.198.599.408 1.455 2.569 2.125 5.32 2.125 8.736 0 4.004-1.745 6.883-4.241 8.302M11.966 6.559c2.098 0 3.799-1.849 3.799-4.13 0-.173-.012-.348-.035-.521-.137-1.03-.699-1.921-1.583-2.511C13.255-1.196 12.18-1.517 11.082-1.517c-2.098 0-3.799 1.849-3.799 4.13 0 .173.012.348.035.521.137 1.03.699 1.921 1.583 2.511.892.593 1.967.914 3.065.914"/></svg>
                  Apple
                </button>
              </div>

              {message && <p className="text-yellow-400 text-sm font-bold mt-2">{message}</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="bg-neutral-800 p-8 border-4 border-black shadow-[8px_8px_0_0_#000]">
              <h2 className="text-sm font-black text-white bg-black px-2 py-1 inline-block uppercase tracking-widest mb-4">Current Tier</h2>
              <div className="text-6xl font-black uppercase tracking-tight text-yellow-400 drop-shadow-[2px_2px_0_#000]">{tier}</div>
              <p className="mt-4 text-sm text-neutral-300 font-bold font-mono border-t-2 border-neutral-700 pt-4">
                Email: {user.email} <br/>
                Status: <span className="text-yellow-400">{tier === 'FREE' ? 'Active (Limited)' : 'Active (Unlocked)'}</span>
              </p>
            </div>

            <div className="bg-yellow-400 text-black p-8 border-4 border-black shadow-[8px_8px_0_0_#000]">
              <h2 className="text-2xl font-black uppercase mb-6 drop-shadow-[2px_2px_0_#fff]">Redeem Beta Access</h2>
              <div className="flex gap-4">
                <input type="text" placeholder="Coupon Code (e.g., BETAPRO)" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="flex-1 bg-white border-2 border-black p-3 text-sm font-bold focus:outline-none focus:border-neutral-500 transition uppercase" />
                <button onClick={handleRedeemCoupon} disabled={loading} className="bg-black text-white font-black px-8 py-3 shadow-[4px_4px_0_0_#fff] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#fff] transition uppercase text-sm disabled:opacity-50">Redeem</button>
              </div>
              {message && <p className="text-black text-sm font-black mt-4">{message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-neutral-800 p-6 border-4 border-black shadow-[4px_4px_0_0_#000]">
                <h3 className="font-black text-2xl mb-4 text-white uppercase border-b-2 border-neutral-700 pb-2">FREE</h3>
                <ul className="text-sm text-neutral-300 space-y-3 font-mono font-bold">
                  <li>➔ 1 Active Chart</li>
                  <li>➔ Local AI Processing</li>
                  <li>➔ Standard Indicators</li>
                </ul>
              </div>
              <div className="bg-neutral-800 p-6 border-4 border-black shadow-[4px_4px_0_0_#fff]">
                <h3 className="font-black text-2xl mb-4 text-white uppercase border-b-2 border-neutral-700 pb-2">PRO</h3>
                <ul className="text-sm text-yellow-400 space-y-3 font-mono font-bold">
                  <li>➔ 5 Active Charts</li>
                  <li>➔ Gemini / OpenAI Sync</li>
                  <li>➔ Telegram Alerts</li>
                  <li>➔ Replay Simulator</li>
                </ul>
              </div>
              <div className="bg-black p-6 border-4 border-yellow-400 relative overflow-hidden shadow-[4px_4px_0_0_#facc15]">
                <div className="absolute top-4 right-4 bg-yellow-400 text-black text-xs font-black px-2 py-1 uppercase shadow-[2px_2px_0_0_#fff]">Whale</div>
                <h3 className="font-black text-2xl mb-4 text-yellow-400 uppercase border-b-2 border-yellow-400 pb-2 drop-shadow-[2px_2px_0_#fff]">ULTRA</h3>
                <ul className="text-sm text-white space-y-3 font-mono font-bold">
                  <li>➔ Unlimited Charts</li>
                  <li>➔ Custom JS Engine</li>
                  <li>➔ Machine Learning Signals</li>
                  <li>➔ Asset Correlation Matrix</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
