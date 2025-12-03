/**
 * AUTH.JS - Gerencia Login, Cadastro e Recuperação de Senha
 * Arquivo específico para index.html
 */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. BANCO DE DADOS (MockDB)
    // ==========================================
    class MockDatabase {
        constructor() { this.prefix = 'dhl_time_tracker_'; }
        
        _getKey(col) { return `${this.prefix}${col}`; }
        _getData(col) { return JSON.parse(localStorage.getItem(this._getKey(col))) || []; }
        _saveData(col, data) { localStorage.setItem(this._getKey(col), JSON.stringify(data)); }

        findUser(email) { return this._getData('users').find(u => u.email === email); }
        
        createUser(email, hash, secretQuestion, secretAnswer) {
            const users = this._getData('users');
            if(users.find(u => u.email === email)) return null;

            const newUser = { 
                id: Date.now(), email, passwordHash: hash, 
                secretQuestion: secretQuestion || 'pet', 
                secretAnswer: secretAnswer ? secretAnswer.toLowerCase().trim() : '',
                name: email.split('@')[0], avatar: '', bio: '', dept: '', role: '', phone: '',
                createdAt: new Date().toISOString() 
            };
            users.push(newUser); 
            this._saveData('users', users); 
            return newUser;
        }

        updateUserAndReturn(email, newData) {
            let users = this._getData('users');
            const idx = users.findIndex(u => u.email === email);
            if(idx !== -1) {
                users[idx] = {...users[idx], ...newData};
                this._saveData('users', users); 
                return users[idx]; 
            }
            return null;
        }
    }
    const db = new MockDatabase();

    // ==========================================
    // 2. HELPERS
    // ==========================================
    const showNotification = (msg, type='info') => {
        const existing = document.querySelector('.notification'); if(existing) existing.remove();
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;
        const icon = type==='success'?'<i class="fas fa-check-circle"></i>':(type==='error'?'<i class="fas fa-exclamation-triangle"></i>':'<i class="fas fa-info-circle"></i>');
        notif.innerHTML = `${icon} <span>${msg}</span>`;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3500);
    };

    // ==========================================
    // 3. LÓGICA DE LOGIN E CADASTRO
    // ==========================================
    
    // Verificar se já está logado
    if (localStorage.getItem('dhl_active_user')) {
        window.location.href = 'time_tracker.html';
        return;
    }

    let isRegisterMode = false;
    const loginForm = document.getElementById('login-form');
    const toggleReg = document.getElementById('toggle-register');
    const toggleBtn = document.getElementById('toggle-password');
    const footerYear = document.getElementById('login-year');

    if(footerYear) footerYear.textContent = new Date().getFullYear();

    // Alternar visibilidade da senha
    if(toggleBtn) {
        toggleBtn.onclick = () => { 
            const i = document.getElementById('password'); 
            const icon = toggleBtn.querySelector('i');
            if (i.type === 'password') {
                i.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                i.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        };
    }

    // Alternar entre Login e Cadastro
    if(toggleReg) {
        toggleReg.onclick = (e) => {
            isRegisterMode = !isRegisterMode;
            document.getElementById('register-fields').classList.toggle('hidden', !isRegisterMode);
            document.getElementById('login-submit').textContent = isRegisterMode ? 'Cadastrar' : 'Entrar';
            document.getElementById('auth-title').textContent = isRegisterMode ? 'Criar Conta' : 'Acesso ao Sistema';
            document.getElementById('auth-switch-text').textContent = isRegisterMode ? 'Já tem conta?' : 'Não tem conta?';
            e.target.textContent = isRegisterMode ? 'Fazer Login' : 'Criar conta';
            document.getElementById('forgot-password-link').classList.toggle('hidden', isRegisterMode);
        };
    }

    // Submissão do Formulário
    if(loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const pwd = document.getElementById('password').value;

            // --- MODO CADASTRO ---
            if(isRegisterMode) {
                const confirmPwd = document.getElementById('confirm-password').value;
                const question = document.getElementById('reg-secret-question').value;
                const answer = document.getElementById('reg-secret-answer').value;

                if(pwd !== confirmPwd) return showNotification('Senhas não conferem', 'warning');
                if(!question || !answer) return showNotification('Preencha as perguntas de segurança.', 'warning');
                if(pwd.length < 4) return showNotification('A senha deve ter no mínimo 4 caracteres.', 'warning');

                const newUser = db.createUser(email, 'hash_'+pwd, question, answer);
                if(!newUser) return showNotification('E-mail já cadastrado.', 'error');
                
                showNotification('Conta criada com sucesso! Faça login.', 'success');
                // Voltar para tela de login
                toggleReg.click();
                loginForm.reset();
                return;
            }

            // --- MODO LOGIN ---
            const user = db.findUser(email);
            if(!user || user.passwordHash !== 'hash_'+pwd) {
                return showNotification('E-mail ou senha incorretos.', 'error');
            }

            // Salvar sessão e redirecionar
            localStorage.setItem('dhl_active_user', JSON.stringify(user));
            window.location.href = 'time_tracker.html';
        };
    }

    // Lógica simples de "Esqueci minha senha" (Placeholder para modal real)
    const forgotLink = document.getElementById('forgot-password-link');
    if(forgotLink) {
        forgotLink.onclick = (e) => {
            e.preventDefault();
            // Aqui você pode implementar o modal de recuperação se ele existir no HTML index.html
            // Como no código original o modal de recuperação estava no HTML mas não visível no snippet:
            alert('Para resetar a senha, entre em contato com o administrador ou use a pergunta secreta (Recurso em desenvolvimento).');
        };
    }
});