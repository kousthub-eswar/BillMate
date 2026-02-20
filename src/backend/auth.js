const AUTH_KEY = 'billmate_auth';

export function login(phone, pin) {
    // Simple local authentication
    const users = getUsers();
    const user = users.find(u => u.phone === phone && u.pin === pin);

    if (user) {
        const session = {
            phone: user.phone,
            name: user.name,
            loggedIn: true,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        return { success: true, user: session };
    }

    return { success: false, error: 'Invalid phone or PIN' };
}

export function register(name, phone, pin) {
    const users = getUsers();

    if (users.find(u => u.phone === phone)) {
        return { success: false, error: 'Phone number already registered' };
    }

    users.push({ name, phone, pin });
    localStorage.setItem('billmate_users', JSON.stringify(users));

    return login(phone, pin);
}

export function logout() {
    localStorage.removeItem(AUTH_KEY);
}

export function getSession() {
    const session = localStorage.getItem(AUTH_KEY);
    return session ? JSON.parse(session) : null;
}

export function isAuthenticated() {
    const session = getSession();
    return session && session.loggedIn;
}

function getUsers() {
    const users = localStorage.getItem('billmate_users');
    return users ? JSON.parse(users) : [];
}
