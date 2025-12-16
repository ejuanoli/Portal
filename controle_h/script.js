
const SUPABASE_URL = 'https://gmepchrmdseulnlayyzi.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZXBjaHJtZHNldWxubGF5eXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMjY3MjYsImV4cCI6MjA4MDgwMjcyNn0.7wtAoP3cvz6Q93WiK1PbQAWtYQGGc1GIcN07oBylrv8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allExpenses = [];
let currentFilter = 'today';
let viewMode = 'detailed'; // detailed ou simple
let isLoginMode = true;
let transType = 'despesa'; // Variável para controlar o toggle do modal
let pendingAction = null; 
let originalFormState = {}; // Para comparar se houve mudanças na edição
let originalProfileState = {}; // Controle de edição do perfil
let authMode = 'login'; // login, register, recovery

window.onclick = function(event) {
    const expenseModal = document.getElementById('expense-modal');
    const profileModal = document.getElementById('profile-modal');

    // Se o elemento clicado for o fundo escuro (e não o conteúdo branco)
    if (event.target === expenseModal) {
        closeExpenseModal();
    }
    
    if (event.target === profileModal) {
        closeProfileModal();
    }

    if (event.target === document.getElementById('confirm-modal')) {
        closeConfirmModal();
    }
}



// --- GESTÃO DO MODAL DE CONFIRMAÇÃO ---
function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    document.getElementById('confirm-pass-input').value = ''; // Limpa senha
}

function requestLogout() {
    showDialog(
        'confirm',
        'Sair da Conta',
        'Você será desconectado do aplicativo.',
        performLogout
    );
}

async function performLogout() {
    await supabase.auth.signOut();
    window.location.reload();
}

async function preSaveProfile() {
    const currentEmail = currentUser.email;
    const newEmail = document.getElementById('prof-email-input').value;
    const newPass = document.getElementById('prof-new-pass').value;

    // Apenas verifica segurança se os DADOS SENSÍVEIS mudaram
    // (A checagem se HOUVE alteração geral já foi feita pelo botão disabled)
    const isSensitiveChange = (newEmail !== currentEmail) || (newPass && newPass.trim() !== "");

    if (isSensitiveChange) {
        showDialog(
            'prompt',
            'Alteração Sensível',
            'Você alterou E-mail ou Senha. Confirme sua senha atual para salvar:',
            performSecureSave
        );
    } else {
        // Alteração apenas de perfil (Bio, Nome, etc) - Salva direto
        saveProfileData(); 
    }
}



async function performSecureSave() {
    const password = document.getElementById('confirm-pass-input').value;
    
    if (!password) {
        // Efeito visual de erro no input
        document.getElementById('confirm-pass-input').classList.add('shake');
        setTimeout(() => document.getElementById('confirm-pass-input').classList.remove('shake'), 500);
        return;
    }

    const { error } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: password
    });

    if (error) {
        // --- AQUI ESTÁ O POPUP DE ERRO QUE VOCÊ PEDIU ---
        // Fechamos o prompt atual e abrimos o de erro
        closeConfirmModal();
        setTimeout(() => {
            showDialog(
                'alert',
                'Senha Incorreta',
                'A senha informada não confere. Tente novamente.',
                () => {
                    // Ao clicar em OK, reabre o prompt para tentar de novo
                    preSaveProfile();
                }
            );
        }, 200); // Pequeno delay para transição
        return;
    }

    closeConfirmModal();
    saveProfileData(true);
}
// Função principal de salvar (refatorada)
async function saveProfileData(hasSensitiveUpdates = false) {
    try {
        const newEmail = document.getElementById('prof-email-input').value;

        // Validação Extra de Email antes de enviar
        if (!isValidEmail(newEmail)) {
            throw new Error("O e-mail informado é inválido.");
        }

        const updates = {
             id: currentUser.id,
             name: document.getElementById('prof-name').value,
             phone: document.getElementById('prof-phone').value,
             profession: document.getElementById('prof-job').value,
             bio: document.getElementById('prof-bio').value,
             credit_limit: document.getElementById('prof-limit').value || 0,
             security_question: document.getElementById('prof-question').value,
             security_answer: document.getElementById('prof-answer').value,
             email: newEmail, // Atualiza no banco Profiles
             updated_at: new Date()
        };
        
        // Se houve troca de senha/email no Auth
        if (hasSensitiveUpdates) {
             const newPass = document.getElementById('prof-new-pass').value;
             const authUpdates = {};
             
             if (newEmail !== currentUser.email) authUpdates.email = newEmail;
             if (newPass) authUpdates.password = newPass;

             // Atualiza no Auth do Supabase
             const { error: authError } = await supabase.auth.updateUser(authUpdates);
             if (authError) throw authError;
        }

        // Atualiza na Tabela Profiles
        const { error } = await supabase.from('profiles').upsert(updates);
        if (error) throw error;

        // UI Updates
        closeConfirmModal();
        closeProfileModal();
        
        showDialog('success', 'Perfil Atualizado', 'Seus dados foram salvos com sucesso.');
        
        // Se o email mudou, atualiza o currentUser localmente para refletir na hora
        if (newEmail !== currentUser.email) {
            currentUser.email = newEmail;
        }

        loadProfile();
        
    } catch (err) {
        showDialog('alert', 'Erro ao Salvar', err.message);
    }
}
// --- VALIDAÇÃO DE EMAIL (REGEX) ---
function isValidEmail(email) {
    // Verifica se tem formato texto@texto.texto
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    updateAuthUI();
}

function toggleRecoveryMode() {
    authMode = 'recovery';
    updateAuthUI();
}

function closeRecovery() {
    authMode = 'login';
    updateAuthUI();
}

function updateAuthUI() {
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('btn-auth');
    const footer = document.getElementById('auth-footer');
    const errMsg = document.getElementById('login-error-msg');
    const backBtn = document.getElementById('btn-back-auth');

    // Seções
    const loginFields = document.getElementById('login-fields');
    const regFields = document.getElementById('register-fields');
    const recFields = document.getElementById('recovery-fields');

    errMsg.classList.add('hidden');
    loginFields.classList.add('hidden');
    regFields.classList.add('hidden');
    recFields.classList.add('hidden');
    backBtn.classList.add('hidden');
    footer.classList.remove('hidden');

    if (authMode === 'login') {
        title.innerText = 'Entrar';
        btn.innerText = 'Entrar';
        document.getElementById('toggle-auth-mode').innerText = 'Criar conta';
        loginFields.classList.remove('hidden');

    } else if (authMode === 'register') {
        title.innerText = 'Criar Conta';
        btn.innerText = 'Cadastrar';
        document.getElementById('toggle-auth-mode').innerText = 'Já tenho conta';
        regFields.classList.remove('hidden');

    } else if (authMode === 'recovery') {
        title.innerText = 'Recuperar Senha';
        btn.innerText = 'Verificar e Enviar';
        recFields.classList.remove('hidden');
        footer.classList.add('hidden');
        backBtn.classList.remove('hidden');
    }
}

function switchTab(tabName) {
    // Remove classe 'active' de todos os botões e conteúdos
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Adiciona classe 'active' no botão clicado (identificado pelo onclick no HTML) e no conteúdo alvo
    // Truque: O botão atual é pego via event ou busca manual. 
    // Vamos simplificar: O HTML chama switchTab('profile').
    
    // Ativa o conteúdo
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Ativa o botão (busca pelo texto ou índice, mas vamos fazer via querySelector relativo ao onclick)
    const btns = document.querySelectorAll('.tab-btn');
    if(tabName === 'profile') btns[0].classList.add('active');
    else btns[1].classList.add('active');
}


async function handleAuthAction() {
    const errMsg = document.getElementById('login-error-msg');
    errMsg.classList.add('hidden');

    try {
        if (authMode === 'login') {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            if (!email || !password) throw new Error("Preencha e-mail e senha.");
            await handleLogin(email, password);
        } 
        else if (authMode === 'register') {
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            await handleRegister(email, password);
        }
        else if (authMode === 'recovery') {
            await handleRecovery();
        }
    } catch (error) {
        errMsg.innerText = error.message;
        errMsg.classList.remove('hidden');
    }
}

async function handleRecovery() {
    const email = document.getElementById('rec-email').value;
    const question = document.getElementById('rec-question').value;
    const answer = document.getElementById('rec-answer').value;

    if (!email || !question || !answer) throw new Error("Preencha todos os dados.");

    // 1. Verifica se os dados batem na tabela profiles
    // Nota: Isso requer que a tabela profiles tenha permissão de leitura (RLS)
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !data) throw new Error("Usuário não encontrado.");

    // Validação da Pergunta/Resposta
    if (data.security_question !== question || data.security_answer.toLowerCase() !== answer.toLowerCase()) {
        throw new Error("Resposta de segurança incorreta.");
    }

    // 2. Se tudo certo, envia email de reset do Supabase
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href // Redireciona para o próprio site
    });

    if (resetError) throw resetError;

    showDialog('success', 'E-mail Enviado', 'Enviamos um link de redefinição de senha para o seu e-mail.');
    closeRecovery();
}

async function handleLogin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) throw error;
    
    // Se sucesso, o listener 'onAuthStateChange' ou o reload pegará a sessão,
    // mas chamamos direto aqui para agilizar a UX
    if (data.user) {
        handleUserLoaded(data.user);
    }
}

async function handleRegister(email, password) {
    const name = document.getElementById('reg-name').value;
    const question = document.getElementById('reg-question').value;
    const answer = document.getElementById('reg-answer').value;

    // 1. Validação de Campos Vazios
    if (!name || !question || !answer || !email || !password) {
        throw new Error("Preencha todos os campos.");
    }

    // 2. Validação de Formato de Email
    if (!isValidEmail(email)) {
        throw new Error("Por favor, insira um e-mail válido (ex: nome@exemplo.com).");
    }

    // 3. Cria usuário
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { name: name } }
    });

    if (error) throw error;

    if (data.user) {
        // 4. Salva no banco de dados
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: data.user.id,
                name: name,
                email: email,
                security_question: question,
                security_answer: answer,
                credit_limit: 0
            }]);

        if (profileError) console.error(profileError);

        // 5. Sucesso Imediato (Sem pedir verificação de email)
        showDialog('success', 'Bem-vindo!', 'Conta criada com sucesso. Entrando...', () => {
             // Se o Auto-Confirm estiver ligado no Supabase, o login já acontece
             if(data.session) {
                 handleUserLoaded(data.user);
             } else {
                 // Fallback: Tenta logar manualmente
                 handleLogin(email, password);
             }
        });
    }
}

async function handleLogout() {
    if(confirm("Tem certeza que deseja sair?")) {
        const { error } = await supabase.auth.signOut();
        if (!error) {
            window.location.reload();
        }
    }
}
// --- INICIALIZAÇÃO ---
window.addEventListener('load', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) handleUserLoaded(session.user);
});

// --- AUTENTICAÇÃO E PERFIL ---
// (Mantenha as funções toggleAuthMode, handleAuthAction, handleLogin, etc. iguais à resposta anterior se já funcionavam)
// Vou focar nas partes novas abaixo:

async function handleUserLoaded(user) {
    currentUser = user;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    loadProfile();
    fetchExpenses();
}

async function loadProfile() {
    // ... código de carregamento do Auth (Email) ...
    if (currentUser) {
        document.getElementById('prof-email-input').value = currentUser.email;
    }

    let { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    
    if(profile) {
        document.getElementById('welcome-msg').innerText = `Olá, ${profile.name || 'Usuário'}`;
        
        // Popula campos
        document.getElementById('prof-name').value = profile.name || '';
        document.getElementById('prof-phone').value = profile.phone || '';
        document.getElementById('prof-job').value = profile.profession || '';
        document.getElementById('prof-bio').value = profile.bio || '';
        
        document.getElementById('prof-limit').value = profile.credit_limit || '';
        if(profile.security_question) document.getElementById('prof-question').value = profile.security_question;
        document.getElementById('prof-answer').value = profile.security_answer || '';
        document.getElementById('prof-new-pass').value = ''; 

        // Salva ESTADO ORIGINAL para comparação
        originalProfileState = {
            name: profile.name || '',
            phone: profile.phone || '',
            job: profile.profession || '',
            bio: profile.bio || '',
            email: currentUser.email, // Do Auth
            limit: profile.credit_limit || '',
            question: profile.security_question || '',
            answer: profile.security_answer || '',
            pass: '' // Senha começa vazia
        };

        // Widgets da Home
        const limit = parseFloat(profile.credit_limit || 0);
        document.getElementById('cc-limit').innerText = `Limite: R$ ${limit.toFixed(2)}`;
        document.getElementById('cc-limit').dataset.value = limit;

        if (profile.avatar_url) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
            const url = data.publicUrl + `?t=${Date.now()}`;
            document.getElementById('user-avatar').src = url;
            document.getElementById('profile-edit-img').src = url;
        }

        // Configura Listener em TODOS os inputs do perfil
        const profileInputs = [
            'prof-name', 'prof-phone', 'prof-job', 'prof-bio',
            'prof-email-input', 'prof-new-pass', 'prof-limit',
            'prof-question', 'prof-answer'
        ];
        
        profileInputs.forEach(id => {
            const el = document.getElementById(id);
            el.oninput = checkProfileValidity; // Checa ao digitar
            el.onchange = checkProfileValidity; // Checa ao mudar (select)
        });
        
        // Desabilita botão inicialmente
        checkProfileValidity();
    }
}

function checkProfileValidity() {
    if (!originalProfileState) return;

    const emailInput = document.getElementById('prof-email-input').value;
    const saveBtn = document.getElementById('btn-save-profile');

    // 1. Validação de Formato de Email Imediata
    if (!isValidEmail(emailInput)) {
        saveBtn.disabled = true; // Bloqueia se o email for inválido
        return;
    }

    const current = {
        name: document.getElementById('prof-name').value,
        phone: document.getElementById('prof-phone').value,
        job: document.getElementById('prof-job').value,
        bio: document.getElementById('prof-bio').value,
        email: emailInput,
        limit: document.getElementById('prof-limit').value,
        question: document.getElementById('prof-question').value,
        answer: document.getElementById('prof-answer').value,
        pass: document.getElementById('prof-new-pass').value
    };

    const hasChanged = 
        current.name !== originalProfileState.name ||
        current.phone !== originalProfileState.phone ||
        current.job !== originalProfileState.job ||
        current.bio !== originalProfileState.bio ||
        current.email !== originalProfileState.email ||
        current.limit != originalProfileState.limit || 
        current.question !== originalProfileState.question ||
        current.answer !== originalProfileState.answer ||
        current.pass !== '';

    saveBtn.disabled = !hasChanged;
}


async function saveProfile() {
    try {
        // 1. Atualizar Senha (Se preenchido)
        const newPass = document.getElementById('prof-new-pass').value;
        if (newPass && newPass.trim() !== "") {
            const { error: passError } = await supabase.auth.updateUser({ password: newPass });
            if (passError) throw new Error("Erro ao alterar senha: " + passError.message);
            alert("Senha alterada com sucesso!");
        }

        // 2. Atualizar Dados do Perfil
        const updates = {
            id: currentUser.id,
            name: document.getElementById('prof-name').value,
            phone: document.getElementById('prof-phone').value,        // Novo
            profession: document.getElementById('prof-job').value,     // Novo
            bio: document.getElementById('prof-bio').value,            // Novo
            credit_limit: document.getElementById('prof-limit').value || 0,
            security_question: document.getElementById('prof-question').value,
            security_answer: document.getElementById('prof-answer').value,
            updated_at: new Date()
        };

        const { error } = await supabase.from('profiles').upsert(updates);
        if (error) throw error;

        alert('Dados salvos com sucesso!');
        closeProfileModal();
        loadProfile();
        fetchExpenses(); // Atualiza UI
    } catch (err) {
        alert(err.message);
    }
}
// --- CORE: BUSCAR E RENDERIZAR ---

async function fetchExpenses() {
    const list = document.getElementById('expenses-list');
    list.innerHTML = '<p style="text-align:center; padding:20px; color:#666">Carregando...</p>';

    // Busca tudo (Receitas e Despesas)
    let { data, error } = await supabase
        .from('gastos')
        .select('*')
        .order('data_gasto', { ascending: false });

    if (!error) {
        allExpenses = data;
        calculateFinanceSummary(); // Calcula Totais
        calculateCreditCardUsage(); // Calcula Cartão
        renderExpenses(); // Desenha a lista
    }
}

function calculateFinanceSummary() {
    // Calcula totais baseados em TUDO (independente do filtro de data visual, 
    // ou se preferir que o saldo obedeça o filtro, mova isso para dentro do renderExpenses)
    // Aqui farei obedecer ao FILTRO ATUAL para fazer sentido pro usuário
    
    // ATENÇÃO: Para saldo global real (banco), deveríamos somar tudo. 
    // Mas para visualização de "Mês", somamos só o mês. 
    // Vou fazer o saldo ser sempre GLOBAL (Todo o histórico) para ser realista,
    // e os cards de "Entrada/Saída" obedecerem o filtro.
    
    const totalIncomeAll = allExpenses.filter(e => e.tipo === 'receita').reduce((acc, c) => acc + parseFloat(c.valor), 0);
    const totalExpenseAll = allExpenses.filter(e => e.tipo === 'despesa').reduce((acc, c) => acc + parseFloat(c.valor), 0);
    const balance = totalIncomeAll - totalExpenseAll;

    const balanceEl = document.getElementById('total-balance');
    const cardEl = document.getElementById('main-balance-card');
    
    balanceEl.innerText = `R$ ${balance.toFixed(2)}`;
    
    // Alerta de Saldo Negativo
    if (balance < 0) {
        cardEl.classList.add('negative');
        balanceEl.innerText += " (Alerta!)";
    } else {
        cardEl.classList.remove('negative');
    }
}

function calculateCreditCardUsage() {
    // Soma gastos APENAS de cartão de crédito (Globais, não filtrados por data, pois limite é global)
    // E considera apenas "despesas"
    const creditExpenses = allExpenses
        .filter(e => e.metodo_pagamento === 'Cartão de Crédito' && e.tipo === 'despesa')
        .reduce((acc, c) => acc + parseFloat(c.valor), 0);

    const limit = parseFloat(document.getElementById('cc-limit').dataset.value || 0);
    
    document.getElementById('cc-used').innerText = `Gasto: R$ ${creditExpenses.toFixed(2)}`;

    if (limit > 0) {
        const percent = Math.min((creditExpenses / limit) * 100, 100);
        document.getElementById('cc-progress').style.width = `${percent}%`;
        document.getElementById('cc-percentage').innerText = `${percent.toFixed(0)}%`;
        
        // Muda cor da barra se estourar 90%
        if(percent > 90) document.getElementById('cc-progress').style.backgroundColor = '#ef4444';
        else document.getElementById('cc-progress').style.backgroundColor = '#f59e0b';
    }
}

function renderExpenses() {
    const list = document.getElementById('expenses-list');
    list.innerHTML = '';

    // 1. Filtragem de Data
    const now = new Date();
    now.setHours(0,0,0,0);

    const rawList = allExpenses.filter(g => {
        const [year, month, day] = g.data_gasto.split('-');
        const gDate = new Date(year, month - 1, day);
        
        if (currentFilter === 'today') return gDate.getTime() === now.getTime();
        if (currentFilter === 'week') {
            const oneWeekAgo = new Date(now);
            oneWeekAgo.setDate(now.getDate() - 7);
            return gDate >= oneWeekAgo;
        }
        if (currentFilter === 'month') return gDate.getMonth() === now.getMonth() && gDate.getFullYear() === now.getFullYear();
        return true;
    });

    // Atualiza Cards de Totais (Baseado nas transações brutas do período)
    const incomePeriod = rawList.filter(e => e.tipo === 'receita').reduce((a,c) => a + Number(c.valor), 0);
    const expensePeriod = rawList.filter(e => e.tipo === 'despesa').reduce((a,c) => a + Number(c.valor), 0);
    document.getElementById('total-income').innerText = `R$ ${incomePeriod.toFixed(2)}`;
    document.getElementById('total-expense').innerText = `R$ ${expensePeriod.toFixed(2)}`;

    if(rawList.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:20px; color:#666">Sem dados neste período.</p>';
        return;
    }

    // 2. Processamento (Agrupamento ou Lista Simples)
    let displayList = [];

    if (viewMode === 'simple') {
        // --- MODO RESUMIDO: Agrupa por data e soma ---
        const groups = {};
        
        rawList.forEach(item => {
            const dateKey = item.data_gasto;
            if (!groups[dateKey]) groups[dateKey] = 0;
            
            // Lógica de Soma: Receita (+), Despesa (-)
            const valor = parseFloat(item.valor);
            if (item.tipo === 'receita') groups[dateKey] += valor;
            else groups[dateKey] -= valor;
        });

        // Transforma o objeto groups em um array ordenado
        displayList = Object.keys(groups)
            .sort((a, b) => b.localeCompare(a)) // Ordena data decrescente
            .map(date => ({
                isGroup: true,
                date: date,
                total: groups[date]
            }));

    } else {
        // --- MODO DETALHADO: Lista normal ---
        displayList = rawList; // Já está ordenada pelo fetchExpenses
    }

    // 3. Paginação (Ver Mais / Ver Menos)
    const initialLimit = 4;
    const itemsToShow = displayList.slice(0, initialLimit);
    const remainingItems = displayList.slice(initialLimit);

    // Função para desenhar o item (Generica para os dois modos)
    const createItemElement = (item) => {
        if (item.isGroup) {
            // Desenha DIA RESUMIDO
            const [y, m, d] = item.date.split('-');
            const total = item.total;
            const isPositive = total >= 0;
            
            const div = document.createElement('div');
            div.className = 'summary-item';
            // Borda verde se positivo, vermelha se negativo
            div.style.borderLeftColor = isPositive ? 'var(--success)' : 'var(--danger)';
            div.innerHTML = `
                <div class="summary-date">${d}/${m}/${y}</div>
                <div class="summary-total" style="color: ${isPositive ? 'var(--success)' : 'var(--text)'}">
                    ${isPositive ? '+' : ''} R$ ${total.toFixed(2)}
                </div>
            `;
            return div;

        } else {
            // Desenha TRANSAÇÃO INDIVIDUAL
            const g = item;
            const isIncome = g.tipo === 'receita';
            const [y, m, d] = g.data_gasto.split('-');
            
            const div = document.createElement('div');
            div.className = 'expense-item';
            div.onclick = () => openExpenseModal(g);
            div.innerHTML = `
                <div class="expense-left">
                    <div class="cat-icon ${isIncome ? 'income' : ''}">
                        ${isIncome ? 'attach_money' : g.categoria.charAt(0)}
                    </div>
                    <div class="expense-details">
                        <h4>${g.descricao}</h4>
                        <p>${g.categoria} • ${g.metodo_pagamento || ''} • ${d}/${m}</p>
                    </div>
                </div>
                <div class="expense-amount ${isIncome ? 'income' : ''}">
                    ${isIncome ? '+' : '-'} R$ ${parseFloat(g.valor).toFixed(2)}
                </div>
            `;
            return div;
        }
    };

    // 4. Renderiza itens visíveis
    itemsToShow.forEach(item => {
        list.appendChild(createItemElement(item));
    });

    // 5. Botão Ver Mais (Se houver itens sobrando)
    if (remainingItems.length > 0) {
        const extraContainer = document.createElement('div');
        extraContainer.id = 'extra-expenses-container';
        extraContainer.style.display = 'none';
        
        // Adiciona o restante no container oculto
        remainingItems.forEach(item => {
            extraContainer.appendChild(createItemElement(item));
        });
        list.appendChild(extraContainer);

        // Cria o botão
        const btnContainer = document.createElement('div');
        btnContainer.className = 'expand-container';
        
        const btn = document.createElement('button');
        btn.className = 'expand-btn';
        btn.innerHTML = `<span class="material-icons">expand_more</span> Ver mais (${remainingItems.length})`;
        
        btn.onclick = () => {
            const isHidden = extraContainer.style.display === 'none';
            if (isHidden) {
                extraContainer.style.display = 'block';
                // Animação CSS simples (opcional) pode ser adicionada ao container
                extraContainer.style.animation = 'fadeIn 0.3s'; 
                btn.innerHTML = `<span class="material-icons">expand_less</span> Ver menos`;
            } else {
                extraContainer.style.display = 'none';
                btn.innerHTML = `<span class="material-icons">expand_more</span> Ver mais (${remainingItems.length})`;
            }
        };

        btnContainer.appendChild(btn);
        list.appendChild(btnContainer);
    }
}
// --- CONTROLES DE UI ---

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderExpenses();
}

function toggleViewMode() {
    viewMode = document.getElementById('view-mode').value;
    renderExpenses();
}

// Toggle Receita/Despesa no Modal
function setTransType(type) {
    transType = type;
    
    // Atualiza Visual dos Botões
    const btnDespesa = document.getElementById('type-despesa');
    const btnReceita = document.getElementById('type-receita');
    
    // Reseta classes
    btnDespesa.className = 'type-option';
    btnReceita.className = 'type-option';
    
    if (type === 'despesa') {
        btnDespesa.classList.add('active-expense');
        // Muda Placeholder
        document.getElementById('desc').placeholder = "Ex: Mercado, Aluguel, Uber...";
        document.getElementById('val').placeholder = "- 0.00";
    } else {
        btnReceita.classList.add('active-income');
        // Muda Placeholder
        document.getElementById('desc').placeholder = "Ex: Salário, Venda, Pix recebido...";
        document.getElementById('val').placeholder = "+ 0.00";
    }

    // Verifica validade após trocar o tipo (pois isso conta como alteração)
    checkFormValidity();
}

function showDialog(type, title, message, onConfirm = null) {
    const modal = document.getElementById('confirm-modal');
    const iconEl = document.getElementById('dialog-icon');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-msg');
    const btnConfirm = document.getElementById('btn-confirm-action');
    const btnCancel = document.getElementById('btn-cancel-action');
    const passField = document.getElementById('confirm-password-field');
    const passInput = document.getElementById('confirm-pass-input');

    // 1. Configura Conteúdo
    titleEl.innerText = title;
    msgEl.innerText = message;
    passField.classList.add('hidden');
    passInput.value = ''; // Limpa senha anterior
    
    // Remove classes antigas do ícone
    iconEl.className = 'material-icons modal-icon-large'; 

    // 2. Configura Estilo por Tipo
    if (type === 'danger') {
        // Exclusão / Perigo
        iconEl.innerText = 'warning';
        iconEl.classList.add('icon-danger');
        btnConfirm.style.background = 'var(--danger)';
        btnConfirm.innerText = 'Sim, Excluir';
        btnCancel.classList.remove('hidden');
        
    } else if (type === 'alert') {
        // Erro / Aviso Simples
        iconEl.innerText = 'error_outline';
        iconEl.classList.add('icon-warning');
        btnConfirm.style.background = 'var(--primary)';
        btnConfirm.innerText = 'Entendi';
        btnCancel.classList.add('hidden'); // Esconde cancelar em alertas
        
    } else if (type === 'success') {
        // Sucesso
        iconEl.innerText = 'check_circle';
        iconEl.classList.add('icon-success');
        btnConfirm.style.background = 'var(--success)';
        btnConfirm.innerText = 'OK';
        btnCancel.classList.add('hidden');

    } else if (type === 'prompt') {
        // Pedir Senha
        iconEl.innerText = 'lock';
        iconEl.classList.add('icon-warning');
        passField.classList.remove('hidden');
        btnConfirm.style.background = 'var(--primary)';
        btnConfirm.innerText = 'Confirmar';
        btnCancel.classList.remove('hidden');
        
    } else {
        // Confirm Padrão (Logout, etc)
        iconEl.innerText = 'help_outline';
        btnConfirm.style.background = 'var(--primary)';
        btnConfirm.innerText = 'Sim';
        btnCancel.classList.remove('hidden');
    }

    // 3. Configura Ação do Botão
    btnConfirm.onclick = () => {
        if (onConfirm) onConfirm();
        if (type !== 'prompt') closeConfirmModal(); // Prompt fecha manualmente após validar
    };

    // Abre Modal
    modal.classList.remove('hidden');
}

function checkFormValidity() {
    const saveBtn = document.getElementById('btn-save-expense');
    
    // 1. Pega valores atuais
    const currentDesc = document.getElementById('desc').value.trim();
    const currentVal = document.getElementById('val').value;
    const currentDate = document.getElementById('date').value;
    const currentCat = document.getElementById('cat').value;
    const currentPay = document.getElementById('payment').value;
    
    // 2. Validação Básica: Campos obrigatórios preenchidos?
    const isFilled = currentDesc.length > 0 && currentVal.length > 0 && currentDate.length > 0;
    
    if (!isFilled) {
        saveBtn.disabled = true;
        return;
    }

    // 3. Validação de Alteração (Apenas para Edição)
    if (originalFormState) {
        // Estamos editando: Só habilita se algo mudou
        const hasChanged = 
            currentDesc !== originalFormState.desc ||
            currentVal !== originalFormState.val ||
            currentDate !== originalFormState.date ||
            currentCat !== originalFormState.cat ||
            currentPay !== originalFormState.payment ||
            transType !== originalFormState.type; // transType é global
            
        saveBtn.disabled = !hasChanged;
    } else {
        // Estamos criando novo: Habilita se estiver preenchido
        saveBtn.disabled = false;
    }
}

function openExpenseModal(expense = null) {
    const modal = document.getElementById('expense-modal');
    const saveBtn = document.getElementById('btn-save-expense');
    
    modal.classList.remove('hidden');

    // Elementos do formulário
    const inputs = ['desc', 'val', 'date', 'cat', 'payment'];
    
    if (expense) {
        // --- MODO EDIÇÃO ---
        document.getElementById('expense-id').value = expense.id;
        document.getElementById('desc').value = expense.descricao;
        document.getElementById('val').value = expense.valor;
        document.getElementById('date').value = expense.data_gasto;
        document.getElementById('cat').value = expense.categoria;
        document.getElementById('payment').value = expense.metodo_pagamento;
        setTransType(expense.tipo || 'despesa');
        
        document.getElementById('btn-delete-expense').classList.remove('hidden');
        
        // Guarda estado original para comparar depois
        originalFormState = {
            desc: expense.descricao,
            val: expense.valor,
            date: expense.data_gasto,
            cat: expense.categoria,
            payment: expense.metodo_pagamento,
            type: expense.tipo
        };

        // Botão começa desabilitado (pois não houve alteração ainda)
        saveBtn.disabled = true;

    } else {
        // --- MODO NOVO ITEM (Limpeza Total) ---
        document.getElementById('expense-id').value = '';
        
        // Limpa campos
        document.getElementById('desc').value = '';
        document.getElementById('val').value = '';
        document.getElementById('cat').selectedIndex = 0; // Volta para o primeiro
        document.getElementById('payment').selectedIndex = 0;

        // Data de Hoje
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        document.getElementById('date').value = `${yyyy}-${mm}-${dd}`;
        
        setTransType('despesa'); // Reseta para Despesa por padrão
        document.getElementById('btn-delete-expense').classList.add('hidden');
        
        originalFormState = null; // Não há estado original
        saveBtn.disabled = true; // Botão desabilitado até preencher
    }

    // Adiciona Monitoramento de Digitação em todos os campos
    inputs.forEach(id => {
        const el = document.getElementById(id);
        // Remove listener antigo para não duplicar (hack rápido: clonar o nó ou apenas reatribuir oninput)
        el.oninput = checkFormValidity;
        el.onchange = checkFormValidity;
    });
}

async function saveExpense() {
    // Validação extra de segurança
    const desc = document.getElementById('desc').value;
    const val = document.getElementById('val').value;

    if (!desc || !val) {
        // Usa o novo sistema de popup
        showDialog('alert', 'Campos Obrigatórios', 'Por favor, preencha a descrição e o valor da transação.');
        return;
    }

    const id = document.getElementById('expense-id').value;
    const data = {
        user_id: currentUser.id,
        descricao: desc,
        valor: val,
        data_gasto: document.getElementById('date').value,
        categoria: document.getElementById('cat').value,
        metodo_pagamento: document.getElementById('payment').value,
        tipo: transType
    };

    const saveBtn = document.getElementById('btn-save-expense');
    saveBtn.innerText = 'Salvando...';
    saveBtn.disabled = true; // Evita clique duplo

    try {
        if (id) await supabase.from('gastos').update(data).eq('id', id);
        else await supabase.from('gastos').insert([data]);

        closeExpenseModal();
        fetchExpenses();
        // Não precisamos de alert de sucesso aqui, a UI atualiza rápido
    } catch (error) {
        showDialog('alert', 'Erro', 'Não foi possível salvar: ' + error.message);
    } finally {
        saveBtn.innerText = 'Salvar';
    }
}

async function deleteCurrentExpense() {
    const id = document.getElementById('expense-id').value;
    
    showDialog(
        'danger', 
        'Excluir Transação?', 
        'Esta ação não pode ser desfeita e o valor será removido do saldo.', 
        async () => {
            await supabase.from('gastos').delete().eq('id', id);
            closeExpenseModal(); // Fecha o formulário
            closeConfirmModal(); // Fecha o aviso
            fetchExpenses();     // Atualiza lista
        }
    );
}


// Funções de Modal
function closeExpenseModal() { document.getElementById('expense-modal').classList.add('hidden'); }
function openProfileEditModal() { document.getElementById('profile-modal').classList.remove('hidden'); loadProfile(); }
function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); }
// Upload de avatar mantém igual...
async function uploadAvatar(input) {
    const file = input.files[0];
    if (!file) return;
    const filePath = `${currentUser.id}-${Date.now()}.${file.name.split('.').pop()}`;
    await supabase.storage.from('avatars').upload(filePath, file);
    await supabase.from('profiles').upsert({ id: currentUser.id, avatar_url: filePath });
    loadProfile();
}