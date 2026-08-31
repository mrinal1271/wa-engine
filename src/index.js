// ============================================================
// WA MARKETING BD - DIRECT COMPLETE VERSION (NO CONFIRMATION)
// ============================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        if (method === 'OPTIONS') {
            return new Response(null, { headers });
        }

        let body = {};
        if (method === 'POST' || method === 'PUT') {
            try {
                const text = await request.text();
                if (text) body = JSON.parse(text);
            } catch (e) {
                return new Response(JSON.stringify({ error: 'Invalid JSON' }), { headers, status: 400 });
            }
        }

        // ============================================================
        // TEST ROUTE
        // ============================================================
        if (path === '/' && method === 'GET') {
            return new Response(JSON.stringify({ 
                success: true, 
                message: 'WA MARKETING BD API is running!',
                version: '4.0-DIRECT'
            }), { headers });
        }

        // ============================================================
        // POPUP NOTICE
        // ============================================================
        if (path === '/popup-notice' && method === 'GET') {
            const notice = await env.WA_KV.get('popup:notice', 'json');
            return new Response(JSON.stringify({ 
                success: true, 
                notice: notice || { message: '', active: false }
            }), { headers });
        }

        if (path === '/popup-notice' && method === 'POST') {
            const { message, active } = body;
            await env.WA_KV.put('popup:notice', JSON.stringify({ 
                message: message || '', 
                active: active || false,
                updatedAt: Date.now()
            }));
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        // ============================================================
        // AUTH ROUTES
        // ============================================================
        if (path === '/auth/register' && method === 'POST') {
            const { phone, password, name, referredBy } = body;
            if (!phone || !password || !name) {
                return new Response(JSON.stringify({ error: 'সব তথ্য পূরণ করুন' }), { headers, status: 400 });
            }
            const existing = await env.WA_KV.get(`user:${phone}`, 'json');
            if (existing) {
                return new Response(JSON.stringify({ error: 'এই নম্বরে অ্যাকাউন্ট আছে' }), { headers, status: 400 });
            }
            const newUser = {
                name, password, balance: 0, isPremium: false,
                messagesSentToday: 0, referralEarnings: 0,
                referredBy: referredBy || '', blocked: false,
                lastTaskDate: new Date().toDateString(),
                lastTaskTimestamp: Date.now(), createdAt: Date.now(),
                seenPopup: false
            };
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(newUser));
            return new Response(JSON.stringify({ success: true, user: { phone, ...newUser } }), { headers });
        }

        if (path === '/auth/login' && method === 'POST') {
            const { phone, password } = body;
            if (!phone || !password) {
                return new Response(JSON.stringify({ error: 'ফোন ও পাসওয়ার্ড দিন' }), { headers, status: 400 });
            }
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'অ্যাকাউন্ট পাওয়া যায়নি' }), { headers, status: 404 });
            }
            if (user.blocked) {
                return new Response(JSON.stringify({ error: 'অ্যাকাউন্ট ব্লক' }), { headers, status: 403 });
            }
            if (user.password !== password) {
                return new Response(JSON.stringify({ error: 'ভুল পাসওয়ার্ড' }), { headers, status: 401 });
            }
            
            // Auto reset
            const today = new Date().toDateString();
            if (user.lastTaskDate !== today) {
                user.messagesSentToday = 0;
                user.lastTaskDate = today;
                await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));
            }
            
            return new Response(JSON.stringify({ success: true, user: { phone, ...user } }), { headers });
        }

        if (path === '/user/popup-seen' && method === 'POST') {
            const { phone } = body;
            if (!phone) {
                return new Response(JSON.stringify({ error: 'ফোন দিন' }), { headers, status: 400 });
            }
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            user.seenPopup = true;
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        if (path.startsWith('/user/') && method === 'GET') {
            const phone = path.replace('/user/', '');
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            const today = new Date().toDateString();
            if (user.lastTaskDate !== today) {
                user.messagesSentToday = 0;
                user.lastTaskDate = today;
                await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));
            }
            return new Response(JSON.stringify({ success: true, user: { phone, ...user } }), { headers });
        }

        if (path.startsWith('/user/') && method === 'PUT') {
            const phone = path.replace('/user/', '');
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            const updated = { ...user, ...body };
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(updated));
            return new Response(JSON.stringify({ success: true, user: { phone, ...updated } }), { headers });
        }

        // ============================================================
        // TASK ROUTES
        // ============================================================
        if (path === '/tasks' && method === 'GET') {
            const list = await env.WA_KV.list({ prefix: 'task:' });
            const tasks = [];
            let total = 0, sent = 0, remaining = 0;
            
            for (const key of list.keys) {
                const task = await env.WA_KV.get(key.name, 'json');
                if (task) {
                    const taskData = { id: key.name.replace('task:', ''), ...task };
                    tasks.push(taskData);
                    total++;
                    if (task.status === 'Completed') sent++;
                    if (task.status === 'Active') remaining++;
                }
            }
            
            const filter = url.searchParams.get('filter');
            let filteredTasks = tasks;
            if (filter === 'active') {
                filteredTasks = tasks.filter(t => t.status === 'Active');
            } else if (filter === 'completed') {
                filteredTasks = tasks.filter(t => t.status === 'Completed');
            }
            
            return new Response(JSON.stringify({ 
                success: true, 
                tasks: filteredTasks,
                stats: { total, sent, remaining }
            }), { headers });
        }

        if (path === '/tasks' && method === 'POST') {
            const { numbers, message, freePrice, premPrice } = body;
            if (!numbers || !message) {
                return new Response(JSON.stringify({ error: 'নম্বর ও মেসেজ দিন' }), { headers, status: 400 });
            }

            const list = await env.WA_KV.list({ prefix: 'task:' });
            const existingPhones = new Set();
            for (const key of list.keys) {
                const task = await env.WA_KV.get(key.name, 'json');
                if (task && task.status === 'Active') {
                    existingPhones.add(task.targetPhone);
                }
            }

            const numList = numbers.split(/[\n,;]+/)
                .map(n => n.trim())
                .filter(n => n.length > 5);
            
            const uniqueNumbers = [...new Set(numList)];
            const newNumbers = uniqueNumbers.filter(n => !existingPhones.has(n));
            
            let count = 0;
            for (const num of newNumbers) {
                const taskId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
                await env.WA_KV.put(`task:${taskId}`, JSON.stringify({
                    targetPhone: num, message,
                    freePrice: freePrice || 1, premPrice: premPrice || 3,
                    status: 'Active', createdAt: Date.now()
                }));
                count++;
            }
            
            return new Response(JSON.stringify({ 
                success: true, 
                created: count,
                duplicates: uniqueNumbers.length - newNumbers.length,
                total: uniqueNumbers.length
            }), { headers });
        }

        // DELETE multiple tasks
        if (path === '/tasks/delete-multiple' && method === 'POST') {
            const { taskIds } = body;
            if (!taskIds || !Array.isArray(taskIds)) {
                return new Response(JSON.stringify({ error: 'টাস্ক আইডি দিন' }), { headers, status: 400 });
            }
            let deleted = 0;
            for (const id of taskIds) {
                await env.WA_KV.delete(`task:${id}`);
                deleted++;
            }
            return new Response(JSON.stringify({ success: true, deleted }), { headers });
        }

        if (path.startsWith('/tasks/') && method === 'DELETE') {
            const taskId = path.replace('/tasks/', '');
            await env.WA_KV.delete(`task:${taskId}`);
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        if (path === '/tasks' && method === 'DELETE') {
            const list = await env.WA_KV.list({ prefix: 'task:' });
            let deleted = 0;
            for (const key of list.keys) {
                await env.WA_KV.delete(key.name);
                deleted++;
            }
            return new Response(JSON.stringify({ success: true, deleted }), { headers });
        }

        // ============================================================
        // DIRECT COMPLETE (NO CONFIRMATION NEEDED)
        // ============================================================
        if (path === '/task/complete-direct' && method === 'POST') {
            const { phone, taskId, targetPhone, reward, message } = body;
            if (!phone || !taskId) {
                return new Response(JSON.stringify({ error: 'তথ্য দিন' }), { headers, status: 400 });
            }

            // Get user
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }

            // Check limit
            const limit = user.isPremium ? 500 : 100;
            if ((user.messagesSentToday || 0) >= limit) {
                return new Response(JSON.stringify({ error: 'লিমিট শেষ!' }), { headers, status: 400 });
            }

            // Add balance
            const rewardAmount = reward || 1;
            user.balance = (user.balance || 0) + rewardAmount;
            user.messagesSentToday = (user.messagesSentToday || 0) + 1;
            user.lastTaskDate = new Date().toDateString();
            user.lastTaskTimestamp = Date.now();
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));

            // Save history
            const historyId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            await env.WA_KV.put(`history:${phone}:${historyId}`, JSON.stringify({
                taskId, target: targetPhone || '', reward: rewardAmount,
                type: 'task', status: 'Success',
                date: new Date().toDateString(), timestamp: Date.now()
            }));

            // Delete the task completely
            await env.WA_KV.delete(`task:${taskId}`);

            // Referral commission
            if (user.referredBy) {
                const refUser = await env.WA_KV.get(`user:${user.referredBy}`, 'json');
                if (refUser) {
                    const settings = await env.WA_KV.get('settings:global', 'json');
                    const commission = rewardAmount * ((settings?.referralPercent || 10) / 100);
                    refUser.balance = (refUser.balance || 0) + commission;
                    refUser.referralEarnings = (refUser.referralEarnings || 0) + commission;
                    await env.WA_KV.put(`user:${user.referredBy}`, JSON.stringify(refUser));
                }
            }

            return new Response(JSON.stringify({ 
                success: true, 
                balance: user.balance,
                messagesSentToday: user.messagesSentToday,
                remaining: limit - user.messagesSentToday
            }), { headers });
        }

        // ============================================================
        // P2P
        // ============================================================
        if (path === '/p2p/send' && method === 'POST') {
            const { sender, receiver, amount } = body;
            if (!sender || !receiver || !amount) {
                return new Response(JSON.stringify({ error: 'তথ্য দিন' }), { headers, status: 400 });
            }
            const senderUser = await env.WA_KV.get(`user:${sender}`, 'json');
            const receiverUser = await env.WA_KV.get(`user:${receiver}`, 'json');
            if (!senderUser || !receiverUser) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            if (senderUser.balance < amount) {
                return new Response(JSON.stringify({ error: 'অপর্যাপ্ত ব্যালেন্স' }), { headers, status: 400 });
            }
            senderUser.balance -= amount;
            receiverUser.balance = (receiverUser.balance || 0) + amount;
            await env.WA_KV.put(`user:${sender}`, JSON.stringify(senderUser));
            await env.WA_KV.put(`user:${receiver}`, JSON.stringify(receiverUser));
            
            const historyId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            await env.WA_KV.put(`history:${sender}:${historyId}`, JSON.stringify({
                target: receiver + ' (' + receiverUser.name + ')',
                amount: amount, type: 'p2p', status: 'Success',
                date: new Date().toDateString(), timestamp: Date.now()
            }));
            
            return new Response(JSON.stringify({ success: true, balance: senderUser.balance }), { headers });
        }

        // ============================================================
        // WITHDRAW
        // ============================================================
        if (path === '/withdraw' && method === 'POST') {
            const { phone, method, accountNum, amount } = body;
            if (!phone || !method || !accountNum || !amount) {
                return new Response(JSON.stringify({ error: 'তথ্য দিন' }), { headers, status: 400 });
            }
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            if (user.balance < amount) {
                return new Response(JSON.stringify({ error: 'অপর্যাপ্ত ব্যালেন্স' }), { headers, status: 400 });
            }
            user.balance -= amount;
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));
            const wdId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            await env.WA_KV.put(`withdraw:${wdId}`, JSON.stringify({
                phone, accountNum, amount, method, status: 'Pending', timestamp: Date.now()
            }));
            
            const historyId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            await env.WA_KV.put(`history:${phone}:${historyId}`, JSON.stringify({
                target: method + ' (' + accountNum + ')',
                amount: amount, type: 'withdraw', status: 'Pending',
                date: new Date().toDateString(), timestamp: Date.now()
            }));
            
            return new Response(JSON.stringify({ success: true, balance: user.balance }), { headers });
        }

        if (path === '/withdrawals' && method === 'GET') {
            const list = await env.WA_KV.list({ prefix: 'withdraw:' });
            const withdrawals = [];
            for (const key of list.keys) {
                const wd = await env.WA_KV.get(key.name, 'json');
                if (wd && wd.status === 'Pending') {
                    withdrawals.push({ id: key.name.replace('withdraw:', ''), ...wd });
                }
            }
            return new Response(JSON.stringify({ success: true, withdrawals }), { headers });
        }

        if (path === '/withdrawals/approve' && method === 'POST') {
            const { id } = body;
            if (!id) {
                return new Response(JSON.stringify({ error: 'আইডি দিন' }), { headers, status: 400 });
            }
            const wd = await env.WA_KV.get(`withdraw:${id}`, 'json');
            if (wd) {
                wd.status = 'Approved';
                await env.WA_KV.put(`withdraw:${id}`, JSON.stringify(wd));
                const list = await env.WA_KV.list({ prefix: `history:${wd.phone}:` });
                for (const key of list.keys) {
                    const item = await env.WA_KV.get(key.name, 'json');
                    if (item && item.type === 'withdraw' && item.amount === wd.amount && item.status === 'Pending') {
                        item.status = 'Success';
                        await env.WA_KV.put(key.name, JSON.stringify(item));
                        break;
                    }
                }
            }
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        // ============================================================
        // HISTORY
        // ============================================================
        if (path.startsWith('/history/') && method === 'GET') {
            const phone = path.replace('/history/', '');
            const list = await env.WA_KV.list({ prefix: `history:${phone}:` });
            const history = [];
            for (const key of list.keys) {
                const item = await env.WA_KV.get(key.name, 'json');
                if (item) history.push(item);
            }
            history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return new Response(JSON.stringify({ success: true, history }), { headers });
        }

        // ============================================================
        // SETTINGS
        // ============================================================
        if (path === '/settings' && method === 'GET') {
            const settings = await env.WA_KV.get('settings:global', 'json');
            if (!settings) {
                const defaults = {
                    freeDailyLimit: 100,
                    premiumDailyLimit: 500,
                    freeUserMinWithdraw: 100,
                    premiumUserMinWithdraw: 1000,
                    p2pMin: 50,
                    referralPercent: 10,
                    refreshHours: 24,
                    noticeText: "🚀 WA MARKETING BD",
                    rules: "১. হোয়াটসঅ্যাপে মেসেজ পাঠান\n২. কনফার্ম করুন",
                    support: "YouTube: https://youtube.com"
                };
                await env.WA_KV.put('settings:global', JSON.stringify(defaults));
                return new Response(JSON.stringify({ success: true, settings: defaults }), { headers });
            }
            return new Response(JSON.stringify({ success: true, settings }), { headers });
        }

        if (path === '/settings' && method === 'POST') {
            await env.WA_KV.put('settings:global', JSON.stringify(body));
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        // ============================================================
        // ADMIN
        // ============================================================
        if (path === '/admin/users' && method === 'GET') {
            const list = await env.WA_KV.list({ prefix: 'user:' });
            const users = [];
            for (const key of list.keys) {
                const user = await env.WA_KV.get(key.name, 'json');
                if (user) {
                    users.push({ id: key.name.replace('user:', ''), ...user });
                }
            }
            return new Response(JSON.stringify({ success: true, users }), { headers });
        }

        if (path.startsWith('/admin/users/') && method === 'DELETE') {
            const phone = path.replace('/admin/users/', '');
            await env.WA_KV.delete(`user:${phone}`);
            return new Response(JSON.stringify({ success: true }), { headers });
        }

        if (path === '/admin/users/block' && method === 'POST') {
            const { phone } = body;
            if (!phone) {
                return new Response(JSON.stringify({ error: 'ফোন দিন' }), { headers, status: 400 });
            }
            const user = await env.WA_KV.get(`user:${phone}`, 'json');
            if (!user) {
                return new Response(JSON.stringify({ error: 'ইউজার নেই' }), { headers, status: 404 });
            }
            user.blocked = !user.blocked;
            await env.WA_KV.put(`user:${phone}`, JSON.stringify(user));
            return new Response(JSON.stringify({ success: true, blocked: user.blocked }), { headers });
        }

        if (path === '/admin/stats' && method === 'GET') {
            const userList = await env.WA_KV.list({ prefix: 'user:' });
            const taskList = await env.WA_KV.list({ prefix: 'task:' });
            const wdList = await env.WA_KV.list({ prefix: 'withdraw:' });
            let totalUsers = 0, activeWorkers = 0, pendingWithdrawals = 0, totalPaid = 0;
            for (const key of userList.keys) {
                const user = await env.WA_KV.get(key.name, 'json');
                if (user) {
                    totalUsers++;
                    if ((user.messagesSentToday || 0) > 0) activeWorkers++;
                }
            }
            for (const key of wdList.keys) {
                const wd = await env.WA_KV.get(key.name, 'json');
                if (wd) {
                    if (wd.status === 'Pending') pendingWithdrawals++;
                    if (wd.status === 'Approved') totalPaid += Number(wd.amount || 0);
                }
            }
            return new Response(JSON.stringify({
                success: true,
                stats: {
                    totalUsers, activeWorkers, pendingWithdrawals,
                    totalPaid, totalTasks: taskList.keys.length
                }
            }), { headers });
        }

        if (path === '/admin/cleanup' && method === 'POST') {
            const { hours } = body;
            if (!hours) {
                return new Response(JSON.stringify({ error: 'ঘন্টা দিন' }), { headers, status: 400 });
            }
            const threshold = Date.now() - (hours * 60 * 60 * 1000);
            const list = await env.WA_KV.list({ prefix: 'history:' });
            let deleted = 0;
            for (const key of list.keys) {
                const item = await env.WA_KV.get(key.name, 'json');
                if (item && item.timestamp && item.timestamp < threshold) {
                    await env.WA_KV.delete(key.name);
                    deleted++;
                }
            }
            return new Response(JSON.stringify({ success: true, deleted }), { headers });
        }

        return new Response(JSON.stringify({ error: 'Route not found' }), { headers, status: 404 });
    }
};
