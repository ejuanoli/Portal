// --- CONFIGURAÇÃO DO SUPABASE ---
const supabaseUrl = 'https://gmepchrmdseulnlayyzi.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZXBjaHJtZHNldWxubGF5eXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMjY3MjYsImV4cCI6MjA4MDgwMjcyNn0.7wtAoP3cvz6Q93WiK1PbQAWtYQGGc1GIcN07oBylrv8';
const db = supabase.createClient(supabaseUrl, supabaseKey);

// --- ELEMENTOS ---
const loginForm = document.getElementById('login-form');
const toggleRegisterBtn = document.getElementById('toggle-register');
const registerFields = document.getElementById('register-fields');
const authTitle = document.getElementById('auth-title');
const submitBtn = document.getElementById('login-submit');
const togglePasswordBtn = document.getElementById('toggle-password');
const authSwitchText = document.getElementById('auth-switch-text');
const msgBox = document.getElementById('auth-message');
const forgotPassLink = document.getElementById('forgot-password-link');
const loginActionsDiv = document.getElementById('login-actions');

let isRegistering = false;

// --- FUNÇÕES AUXILIARES ---

function showMessage(text, type = 'error') {
    // ALTERAÇÃO: Usamos innerHTML para permitir links dentro da mensagem
    msgBox.innerHTML = text; 
    msgBox.className = type === 'success' ? 'msg-success' : 'msg-error';
    if(type === 'success') setTimeout(() => { msgBox.innerHTML = ''; }, 5000);
}

function toggleView(forceRegister = false) {
    if (forceRegister) isRegistering = false; 
    
    isRegistering = !isRegistering;
    
    if (isRegistering) {
        // MODO CADASTRO / RECUPERAÇÃO
        registerFields.classList.remove('hidden');
        loginActionsDiv.classList.add('hidden'); // Some o link "Esqueci senha"
        
        authTitle.innerText = "Criar ou Recuperar Conta";
        submitBtn.innerText = "Confirmar";
        authSwitchText.innerText = "Já tem uma conta?";
        toggleRegisterBtn.innerText = "Voltar para Login";
        msgBox.innerHTML = ""; 
    } else {
        // MODO LOGIN
        registerFields.classList.add('hidden');
        loginActionsDiv.classList.remove('hidden'); // Volta o link "Esqueci senha"
        
        authTitle.innerText = "Acesso ao Sistema";
        submitBtn.innerText = "Entrar";
        authSwitchText.innerText = "Não tem uma conta?";
        toggleRegisterBtn.innerText = "Criar conta";
        msgBox.innerHTML = "";
    }
}

// --- EVENTOS ---

toggleRegisterBtn.addEventListener('click', () => toggleView());

forgotPassLink.addEventListener('click', (e) => {
    e.preventDefault();
    showMessage("Preencha os dados abaixo e a resposta secreta para redefinir.", "success");
    if (!isRegistering) toggleView();
});

togglePasswordBtn.addEventListener('click', () => {
    const passInput = document.getElementById('password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
});

// --- LÓGICA PRINCIPAL ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        if (!isRegistering) {
            // ================= MODO LOGIN =================
            msgBox.innerText = "Verificando..."; 
            
            const { data, error } = await db
                .from('users')
                .select('*')
                .eq('email', email)
                .maybeSingle(); 

            if (error) {
                console.error(error);
                showMessage("Erro de conexão.", "error");
                return;
            }

            // USUÁRIO NÃO ENCONTRADO
            if (!data) {
                // ALTERAÇÃO AQUI: Não muda a tela, apenas mostra a pergunta clicável
                msgBox.innerHTML = `Usuário não encontrado. <br>
                    <a href="#" id="link-create-acc" style="color: inherit; text-decoration: underline; font-weight: bold;">
                        Deseja criar uma conta?
                    </a>`;
                msgBox.className = 'msg-error';
                
                // Adiciona o evento de clique na pergunta que acabamos de criar
                document.getElementById('link-create-acc').onclick = (evt) => {
                    evt.preventDefault();
                    toggleView(); // Agora sim muda a tela se clicar
                };
                
                return;
            }

            // SENHA INCORRETA
            if (data.password !== password) {
                showMessage("Senha incorreta.", "error");
                return;
            }

            // SUCESSO NO LOGIN
            console.log("Login OK!");
            localStorage.setItem('usuarioLogado', email);
            localStorage.setItem('dhl_active_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
            localStorage.removeItem('dhl_timer_start');
            localStorage.removeItem('dhl_timer_activity');
            window.location.href = 'time_tracker.html';

        } else {
            // ================= MODO REGISTRO / REDEFINIÇÃO =================
            msgBox.innerText = "Processando...";
            
            const confirmPassword = document.getElementById('confirm-password').value;
            const secretQuestion = document.getElementById('reg-secret-question').value;
            const secretAnswer = document.getElementById('reg-secret-answer').value.trim();

            if (password !== confirmPassword) return showMessage("As senhas não coincidem.");
            if (!secretQuestion || !secretAnswer) return showMessage("Preencha a pergunta secreta.");

            const { data: userExisting } = await db
                .from('users')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (userExisting) {
                // REDEFINIÇÃO
                if (userExisting.secret_answer && 
                    userExisting.secret_answer.toLowerCase() === secretAnswer.toLowerCase()) {
                    
                    const { error: updateError } = await db
                        .from('users')
                        .update({ password: password })
                        .eq('email', email);

                    if (updateError) {
                        showMessage("Erro ao atualizar senha.", "error");
                    } else {
                        showMessage("Senha redefinida! Entrando...", "success");
                        localStorage.setItem('usuarioLogado', email);
                        localStorage.setItem('dhl_active_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
                        setTimeout(() => { window.location.href = 'time_tracker.html'; }, 1000);
                    }
                } else {
                    showMessage("Resposta secreta incorreta.", "error");
                }
            } else {
                // NOVO CADASTRO
                const { error: insertError } = await db
                    .from('users')
                    .insert({
                        email: email,
                        password: password,
                        secret_question: secretQuestion,
                        secret_answer: secretAnswer
                    });

                if (insertError) {
                    showMessage("Erro ao cadastrar: " + insertError.message, "error");
                } else {
                    showMessage("Conta criada! Entrando...", "success");
                    localStorage.setItem('usuarioLogado', email);
                    localStorage.setItem('dhl_active_user', JSON.stringify({ email: email, name: email.split('@')[0] }));
                    setTimeout(() => { window.location.href = 'time_tracker.html'; }, 1000);
                }
            }
        }
    } catch (err) {
        console.error("Erro JS:", err);
        showMessage("Ocorreu um erro inesperado.", "error");
    }
});
