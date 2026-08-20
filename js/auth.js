// auth.js — Supabase-backed authentication.
//
// Replaces the previous localStorage "auth", which compared a plaintext
// password against a value sitting in the same browser store it was guarding.
// Passwords are now hashed server-side and sessions are real JWTs.

const SUPABASE_URL = 'https://lazrgdyptxthibwvfqvc.supabase.co';

// The anon (publishable) key is designed to be shipped in client code — it only
// grants what row-level security allows. The service_role key must never appear
// here, in the repo, or anywhere the browser can reach.
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhenJnZHlwdHh0aGlid3ZmcXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTY2NzcsImV4cCI6MjA4NzUzMjY3N30' +
    '.kNZ8uo5KBU0VAQHxZtgihFbV5auS7YgVAbkZo7QNhBM';

const Auth = {
    client: null,
    ready: false,
    _user: null,
    _listeners: [],

    configured() {
        return !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('__');
    },

    init() {
        if (this.client) return this.client;
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('Supabase client library failed to load.');
        }
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                storageKey: 'cozyhome_auth'
            }
        });

        this.client.auth.onAuthStateChange((_event, session) => {
            this._user = this._shape(session?.user);
            this._listeners.forEach(fn => fn(this._user));
        });

        return this.client;
    },

    // Restores any session persisted from a previous visit. Call once at boot.
    async restore() {
        if (!this.configured()) { this.ready = true; return null; }
        this.init();
        const { data, error } = await this.client.auth.getSession();
        if (error) console.warn('[Auth] session restore failed', error);
        this._user = this._shape(data?.session?.user);
        this.ready = true;
        return this._user;
    },

    getUser() {
        return this._user;
    },

    onChange(fn) {
        this._listeners.push(fn);
    },

    async signUp(username, name, email, password) {
        this.init();
        const { data, error } = await this.client.auth.signUp({
            email,
            password,
            options: { data: { username, name } }
        });
        if (error) throw new Error(this._message(error));

        // With email confirmation enabled Supabase returns a user but no
        // session — the account exists but cannot sign in until confirmed.
        if (!data.session) {
            return { needsConfirmation: true, email };
        }
        this._user = this._shape(data.user);
        return { needsConfirmation: false, user: this._user };
    },

    async signIn(email, password) {
        this.init();
        const { data, error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(this._message(error));
        this._user = this._shape(data.user);
        return this._user;
    },

    async signOut() {
        if (!this.client) return;
        const { error } = await this.client.auth.signOut();
        if (error) console.warn('[Auth] sign out failed', error);
        this._user = null;
    },

    // Normalises Supabase's user into the shape the rest of the app expects,
    // so views can keep reading user.username / user.email.
    _shape(u) {
        if (!u) return null;
        const meta = u.user_metadata || {};
        return {
            id: u.id,
            email: u.email || '',
            username: meta.username || (u.email || '').split('@')[0] || 'user',
            name: meta.name || meta.username || ''
        };
    },

    // Supabase messages are decent but a few are worth rewording for players.
    _message(error) {
        const m = (error && error.message) || 'Something went wrong.';
        if (/Invalid login credentials/i.test(m)) return 'That email and password do not match an account.';
        if (/User already registered/i.test(m)) return 'An account with that email already exists. Try signing in.';
        if (/Password should be at least/i.test(m)) return 'Password must be at least 6 characters.';
        if (/Unable to validate email address/i.test(m)) return 'That does not look like a valid email address.';
        if (/Email rate limit exceeded/i.test(m)) return 'Too many attempts just now — wait a minute and try again.';
        return m;
    }
};
