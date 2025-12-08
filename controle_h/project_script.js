document.addEventListener('DOMContentLoaded', () => {

    let isProjectsExpanded = false;
    let pendingDeleteProjectId = null;
    // ==========================================
    // GESTÃO DE USUÁRIO E PERFIL (Igual App.js)
    // ==========================================
    
    // 1. Recuperar Usuário Ativo
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('dhl_active_user'));
    } catch(e) { console.error("Erro user", e); }

    if (!currentUser) {
        window.location.href = 'index.html';
    }

    // 2. Função para atualizar UI do Usuário (Header e Dropdown)
    const updateUserUI = () => {
        if(!currentUser) return;

        // Nome
        document.getElementById('header-username').textContent = currentUser.name;
        const ddName = document.getElementById('dropdown-name');
        if(ddName) ddName.textContent = currentUser.name;
        const ddEmail = document.getElementById('dropdown-email');
        if(ddEmail) ddEmail.textContent = currentUser.email;

        // Avatar Header
        const avatarImg = document.getElementById('header-avatar');
        if(avatarImg) {
            if(currentUser.avatar && currentUser.avatar.length > 50) {
                avatarImg.src = currentUser.avatar;
                avatarImg.classList.remove('avatar-placeholder');
            } else {
                avatarImg.src = 'https://raw.githubusercontent.com/wuelnerdotexe/DHL-clone/main/src/assets/default-user.png';
            }
        }
    };

    // 3. Helper para atualizar BD de Usuários (Compartilhado com Time Tracker)
    const updateUserInDB = (email, newData) => {
        // Nota: A chave do banco de usuários é a mesma definida no auth.js
        const USERS_DB_KEY = 'dhl_time_tracker_users'; 
        let users = JSON.parse(localStorage.getItem(USERS_DB_KEY)) || [];
        
        const idx = users.findIndex(u => u.email === email);
        if(idx !== -1) {
            users[idx] = {...users[idx], ...newData};
            localStorage.setItem(USERS_DB_KEY, JSON.stringify(users)); 
            
            // Atualiza sessão atual
            currentUser = users[idx];
            localStorage.setItem('dhl_active_user', JSON.stringify(currentUser));
            return true;
        }
        return false;
    };

    // 4. Lógica do Modal de Perfil
    const openProfileModal = () => {
        document.getElementById('edit-name').value = currentUser.name || '';
        document.getElementById('edit-email').value = currentUser.email || '';
        document.getElementById('edit-bio').value = currentUser.bio || '';
        document.getElementById('edit-dept').value = currentUser.dept || '';
        document.getElementById('edit-role').value = currentUser.role || '';
        document.getElementById('edit-phone').value = currentUser.phone || '';
        
        const largeImg = document.getElementById('profile-image-large');
        if(currentUser.avatar && currentUser.avatar.length > 50) {
            largeImg.src = currentUser.avatar;
        } else {
            largeImg.src = 'https://raw.githubusercontent.com/wuelnerdotexe/DHL-clone/main/src/assets/default-user.png';
        }
        
        document.getElementById('unified-profile-modal').classList.remove('hidden');
    };

    // Event Listeners do Perfil
    document.getElementById('open-unified-modal').onclick = (e) => {
        e.preventDefault();
        openProfileModal();
    };

    document.getElementById('logout-btn').onclick = () => {
        localStorage.removeItem('dhl_active_user');
        window.location.href = 'index.html';
    };

// ==========================================
    // LÓGICA DE ATUALIZAÇÃO DE PERFIL SEGURA
    // ==========================================
    
    // Variável para armazenar as mudanças pendentes enquanto pede a senha
    let pendingProfileUpdates = null;

    // 1. Ao clicar em Salvar no Modal de Perfil
    document.getElementById('unified-profile-form').onsubmit = (e) => {
        e.preventDefault();
        
        // Coleta os dados básicos
        const updates = {
            name: document.getElementById('edit-name').value,
            bio: document.getElementById('edit-bio').value,
            dept: document.getElementById('edit-dept').value,
            role: document.getElementById('edit-role').value,
            phone: document.getElementById('edit-phone').value,
            email: document.getElementById('edit-email').value
        };

        // Verifica se houve pedido de troca de senha (nova senha)
        const newPassInput = document.getElementById('edit-new-password').value;
        if(newPassInput && newPassInput.trim() !== "") {
            updates.passwordHash = 'hash_' + newPassInput;
        }

        // Processamento de Imagem (Assíncrono)
        const fileInput = document.getElementById('profile-image-input');
        if(fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                updates.avatar = evt.target.result;
                triggerPasswordChallenge(updates); // Chama o popup de senha
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            // Mantém avatar antigo se não trocou
            triggerPasswordChallenge(updates);
        }
    };

    // 2. Abre o Popup de Senha
    const triggerPasswordChallenge = (updates) => {
        pendingProfileUpdates = updates; // Guarda na memória
        
        // Limpa erros anteriores e input
        document.getElementById('challenge-password-input').value = '';
        document.getElementById('challenge-error').classList.add('hidden');
        
        // Abre modal de senha
        document.getElementById('password-challenge-modal').classList.remove('hidden');
        document.getElementById('challenge-password-input').focus();
    };

    // 3. Ao Confirmar a Senha no Popup
    document.getElementById('confirm-save-btn').onclick = () => {
        const pwdInput = document.getElementById('challenge-password-input').value;
        const errorMsg = document.getElementById('challenge-error');

        // Validação simples (vazia)
        if(!pwdInput) {
            errorMsg.textContent = "Digite sua senha.";
            errorMsg.classList.remove('hidden');
            return;
        }

        // Verifica se a senha bate com o hash do usuário logado
        if('hash_' + pwdInput !== currentUser.passwordHash) {
            errorMsg.textContent = "Senha incorreta. Tente novamente.";
            errorMsg.classList.remove('hidden');
            // Animação de erro (opcional)
            document.getElementById('challenge-password-input').classList.add('input-error');
            setTimeout(() => document.getElementById('challenge-password-input').classList.remove('input-error'), 500);
            return;
        }

        // SENHA CORRETA: Executa a atualização
        commitProfileUpdate();
    };

    // 4. Efetiva a Gravação no Banco e Mostra Sucesso
    const commitProfileUpdate = () => {
        if(!pendingProfileUpdates) return;

        // Atualiza no "Banco de Dados" (LocalStorage)
        // Nota: Certifique-se que a função updateUserInDB ou updateUserAndReturn existe no seu escopo
        // No app.js use: db.updateUserAndReturn
        // No project_script.js use: updateUserInDB
        
        // Exemplo genérico que funciona se a função estiver definida acima:
        if (typeof db !== 'undefined' && db.updateUserAndReturn) {
             currentUser = db.updateUserAndReturn(currentUser.email, pendingProfileUpdates);
        } else if (typeof updateUserInDB !== 'undefined') {
             updateUserInDB(currentUser.email, pendingProfileUpdates);
             // Recarrega user atual
             currentUser = JSON.parse(localStorage.getItem('dhl_active_user'));
        }

        // Atualiza a UI do Header
        if(typeof updateUserUI !== 'undefined') updateUserUI(); // project_script.js
        if(typeof updateUI !== 'undefined') updateUI(); // app.js

        // Fecha Modal de Senha
        document.getElementById('password-challenge-modal').classList.add('hidden');
        
        // Fecha Modal de Perfil (O PRINCIPAL)
        document.getElementById('unified-profile-modal').classList.add('hidden');

        // Abre Modal de Sucesso
        document.getElementById('success-modal').classList.remove('hidden');
        
        // Limpa campos sensíveis
        document.getElementById('edit-new-password').value = '';
        pendingProfileUpdates = null;
    };

    // 5. Botão "OK" do Modal de Sucesso
    document.getElementById('close-all-modals-btn').onclick = () => {
        document.getElementById('success-modal').classList.add('hidden');
    };

    // 6. Botões "Cancelar" do Modal de Senha
    document.querySelectorAll('.close-challenge-btn').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('password-challenge-modal').classList.add('hidden');
            pendingProfileUpdates = null; // Cancela operação
        };
    });

    // Inicializa UI
    updateUserUI();
    // Simulação de Banco de Dados Local
    const DB_KEY = 'dhl_projects_db';
    
    const getProjects = () => {
        const data = JSON.parse(localStorage.getItem(DB_KEY)) || [];
        return data.sort((a, b) => b.id - a.id);
    };
    const saveProjects = (data) => localStorage.setItem(DB_KEY, JSON.stringify(data));

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    // --- POPULA FILTROS (Área e Usuário) ---
    const populateFilters = () => {
        const projects = getProjects();
        const users = new Set();
        const areas = new Set();
        
        projects.forEach(p => {
            if(p.owner) users.add(p.owner);
            if(p.responsible) users.add(p.responsible);
            if(p.area) areas.add(p.area);
        });

        // Dropdown Usuário
        const userSelect = document.getElementById('filter-user');
        const currentU = userSelect.value;
        userSelect.innerHTML = '<option value="">Usuário: Todos</option>';
        Array.from(users).sort().forEach(u => userSelect.appendChild(new Option(u, u)));
        if(users.has(currentU)) userSelect.value = currentU;

        // Dropdown Área
        const areaSelect = document.getElementById('filter-area');
        const currentA = areaSelect.value;
        areaSelect.innerHTML = '<option value="">Área: Todas</option>';
        Array.from(areas).sort().forEach(a => areaSelect.appendChild(new Option(a, a)));
        if(areas.has(currentA)) areaSelect.value = currentA;
    };

    // --- RENDERIZAÇÃO DA TABELA ---
    const renderTable = () => {
        const tbody = document.querySelector('#projects-table tbody');
        // Seleciona o card para colocar o botão 'Ver Mais' no final dele
        const cardSection = document.querySelector('#projects-table').closest('.card'); 
        
        tbody.innerHTML = '';

        // Remove o botão 'Ver Mais' antigo se ele já existir para não duplicar
        const oldBtn = document.querySelector('.view-more-container');
        if(oldBtn) oldBtn.remove();

        const projects = getProjects();
        
        // 1. Captura os valores dos filtros
        const searchText = document.getElementById('search-project').value.toLowerCase();
        const statusFilter = document.getElementById('filter-status').value;
        const userFilter = document.getElementById('filter-user').value.toLowerCase();
        const areaFilter = document.getElementById('filter-area').value.toLowerCase();

        // 2. Filtra os projetos PRIMEIRO
        const filteredProjects = projects.filter(p => {
            const matchesText = p.name.toLowerCase().includes(searchText) || p.site.toLowerCase().includes(searchText);
            const matchesStatus = statusFilter === "" || p.status === statusFilter;
            const matchesUser = userFilter === "" || (p.owner?.toLowerCase() === userFilter) || (p.responsible?.toLowerCase() === userFilter);
            const matchesArea = areaFilter === "" || (p.area?.toLowerCase() === areaFilter);
            
            return matchesText && matchesStatus && matchesUser && matchesArea;
        });

        // 3. Calcula Totais (Stats)
        let totalActive = 0;
        let totalMoney = 0;

        filteredProjects.forEach(p => {
            if (p.status === 'In Progress') totalActive++;
            totalMoney += parseFloat(p.monetization || 0);
        });

        document.getElementById('total-projects').textContent = filteredProjects.length;
        document.getElementById('active-projects').textContent = totalActive;
        document.getElementById('total-money').textContent = formatCurrency(totalMoney);

        // 4. Lógica de Paginação (Mostrar apenas 6 ou todos)
        // Certifique-se de ter declarado 'let isProjectsExpanded = false;' no topo do arquivo script
        const LIMIT = 6;
        const itemsToShow = isProjectsExpanded ? filteredProjects : filteredProjects.slice(0, LIMIT);

        // 5. Renderiza as linhas
        itemsToShow.forEach(p => {
            
            // Lógica de Cores e Badges
            let statusClass = 'badge-gray';
            if (p.status === 'In Progress') statusClass = 'badge-blue';
            if (p.status === 'Completed') statusClass = 'badge-green';
            if (p.status === 'On Hold') statusClass = 'badge-yellow';
            if (p.status === 'Cancelled') statusClass = 'badge-red';

            // Comentário com botão de ver
            let commentHTML = '-';
            if (p.comments && p.comments.trim().length > 0) {
                const short = p.comments.length > 20 ? p.comments.substring(0, 20) + '...' : p.comments;
                commentHTML = `
                    <div style="display:flex; align-items:center; gap:5px; max-width:150px;">
                        <span style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${short}</span>
                        <button class="icon-btn" onclick="showComment('${encodeURIComponent(p.comments)}')" style="font-size:0.8rem; padding:2px;"><i class="fas fa-eye"></i></button>
                    </div>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="id-column">#${p.id}</td>
                <td class="font-bold">${p.name}</td>
                <td>${p.site}</td>
                <td><span class="badge ${statusClass}">${p.status}</span></td>
                <td>
                    <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${p.progress}%"></div></div>
                    <small>${p.progress}%</small>
                </td>
                <td>${p.category || '-'}</td>
                <td>${p.area || '-'}</td>
                <td>${p.complexity}</td>
                <td>${p.requester || '-'}</td>
                <td>${p.responsible || '-'}</td>
                <td>${new Date(p.startDate).toLocaleDateString()}</td> 
                <td>${p.completionDate ? new Date(p.completionDate).toLocaleDateString() : '-'}</td>
                <td>${p.estimatedHours || 0}h</td>
                <td>${formatCurrency(p.monetization)}</td>
                <td>${commentHTML}</td>
                <td>
                    <button class="icon-btn" onclick="editProject(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn" onclick="deleteProject(${p.id})"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 6. Botão Ver Mais
        if (filteredProjects.length > LIMIT) {
            const btnDiv = document.createElement('div');
            btnDiv.className = 'view-more-container';
            
            const btn = document.createElement('button');
            btn.className = 'btn-view-more';
            btn.innerHTML = isProjectsExpanded 
                ? 'Ver menos <i class="fas fa-chevron-up"></i>' 
                : `Ver mais (${filteredProjects.length - LIMIT}) <i class="fas fa-chevron-down"></i>`;
            
            btn.onclick = () => {
                isProjectsExpanded = !isProjectsExpanded;
                renderTable();
            };
            
            btnDiv.appendChild(btn);
            cardSection.appendChild(btnDiv);
        } else {
            // Se filtrou e sobrou menos que o limite, reseta o estado para evitar bugs visuais
            if(filteredProjects.length <= LIMIT && isProjectsExpanded) isProjectsExpanded = false;
        }
    };

    // --- FUNÇÕES GLOBAIS DE JANELA ---
    window.showComment = (encodedComment) => {
        document.getElementById('full-comment-text').textContent = decodeURIComponent(encodedComment);
        document.getElementById('comment-view-modal').classList.remove('hidden');
    };

    window.editProject = (id) => {
        const p = getProjects().find(x => x.id === id);
        if(!p) return;
        document.getElementById('p-id').value = p.id;
        document.getElementById('p-name').value = p.name;
        document.getElementById('p-site').value = p.site;
        document.getElementById('p-status').value = p.status;
        document.getElementById('p-progress').value = p.progress;
        document.getElementById('p-complexity').value = p.complexity;
        document.getElementById('p-category').value = p.category;
        document.getElementById('p-area').value = p.area;
        document.getElementById('p-owner').value = p.owner;
        document.getElementById('p-responsible').value = p.responsible;
        document.getElementById('p-requester').value = p.requester;
        document.getElementById('p-start-date').value = p.startDate;
        document.getElementById('p-deadline').value = p.deadline;
        document.getElementById('p-completion-date').value = p.completionDate;
        document.getElementById('p-hours').value = p.estimatedHours;
        document.getElementById('p-money').value = p.monetization;
        document.getElementById('p-comments').value = p.comments;
        
        document.getElementById('modal-title').textContent = 'Editar Projeto';
        document.getElementById('project-modal').classList.remove('hidden');
    };

    window.deleteProject = (id) => {
        // Armazena o ID e abre o modal
        pendingDeleteProjectId = id;
        document.getElementById('delete-confirm-modal').classList.remove('hidden');
    };

    // --- AÇÕES UI ---
    const modal = document.getElementById('project-modal');
    document.getElementById('btn-new-project').onclick = () => {
        document.getElementById('project-form').reset();
        document.getElementById('p-id').value = '';
        document.getElementById('modal-title').textContent = 'Novo Projeto';
        modal.classList.remove('hidden');
    };

    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.onclick = function() { this.closest('.modal').classList.add('hidden'); };
    });

    document.getElementById('project-form').onsubmit = (e) => {
        e.preventDefault();
        
        const idField = document.getElementById('p-id').value;
        const projects = getProjects(); // Já vem ordenado, mas vamos calcular o Max ID com segurança
        
        let finalId;

        // Lógica de ID Sequencial
        if (idField) {
            // Edição: Mantém o ID existente
            finalId = parseInt(idField);
        } else {
            // Novo: Pega o maior ID da lista e soma 1
            const maxId = projects.reduce((max, p) => (p.id > max ? p.id : max), 0);
            finalId = maxId + 1;
        }
        
        const newProject = {
            id: finalId,
            name: document.getElementById('p-name').value,
            site: document.getElementById('p-site').value,
            status: document.getElementById('p-status').value,
            progress: document.getElementById('p-progress').value,
            complexity: document.getElementById('p-complexity').value,
            category: document.getElementById('p-category').value,
            area: document.getElementById('p-area').value,
            system: document.getElementById('p-system').value,
            owner: document.getElementById('p-owner').value,
            responsible: document.getElementById('p-responsible').value,
            requester: document.getElementById('p-requester').value,
            startDate: document.getElementById('p-start-date').value,
            deadline: document.getElementById('p-deadline').value,
            completionDate: document.getElementById('p-completion-date').value,
            estimatedHours: document.getElementById('p-hours').value,
            monetization: document.getElementById('p-money').value,
            comments: document.getElementById('p-comments').value
        };

        if (idField) {
            // Atualiza o projeto existente
            const index = projects.findIndex(p => p.id === finalId);
            if (index !== -1) projects[index] = newProject;
        } else {
            // Adiciona novo
            projects.push(newProject);
        }

        saveProjects(projects);
        modal.classList.add('hidden');
        populateFilters();
        renderTable();
    };

    // --- CONTROLES DE FILTRO ---
    document.getElementById('search-project').oninput = renderTable;
    document.getElementById('filter-status').onchange = renderTable;
    document.getElementById('filter-user').onchange = renderTable;
    document.getElementById('filter-area').onchange = renderTable;

    // --- MODO ESCURO E MENU ---
    document.getElementById('dark-mode-toggle').onclick = () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('dhl_dark_mode', document.body.classList.contains('dark-mode'));
    };
    if(localStorage.getItem('dhl_dark_mode') === 'true') document.body.classList.add('dark-mode');

    document.getElementById('user-menu-btn').onclick = () => document.getElementById('user-dropdown').classList.toggle('hidden');
    document.getElementById('btn-export-projects').onclick = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(getProjects()), "Projetos");
        XLSX.writeFile(wb, "Projetos_DHL.xlsx");
    };

    // --- TIMER FLUTUANTE GLOBAL ---
    const checkFloatingTimer = () => {
        const start = localStorage.getItem('dhl_timer_start');
        const activity = localStorage.getItem('dhl_timer_activity');
        const user = JSON.parse(localStorage.getItem('dhl_active_user'));

        if (start && user) {
            let popup = document.getElementById('global-timer-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'global-timer-popup';
                popup.className = 'timer-popup';
                popup.innerHTML = `
                    <div class="timer-popup-content">
                        <span class="timer-popup-label">Timer Ativo</span>
                        <div class="timer-popup-time" id="popup-time-display">00:00:00</div>
                        <div class="timer-popup-activity" title="${activity}">${activity}</div>
                    </div>
                    <button class="timer-popup-btn" id="popup-stop-btn" title="Parar"><i class="fas fa-stop"></i></button>
                `;
                document.body.appendChild(popup);

                document.getElementById('popup-stop-btn').onclick = () => {
                    const sec = Math.floor((Date.now() - parseInt(start)) / 1000);
                    const dbKey = `dhl_time_tracker_entries_${user.email}`;
                    const entries = JSON.parse(localStorage.getItem(dbKey)) || [];
                    entries.push({ id: Date.now(), activity, seconds: sec, timestamp: Date.now(), exported: false });
                    localStorage.setItem(dbKey, JSON.stringify(entries));
                    localStorage.removeItem('dhl_timer_start');
                    localStorage.removeItem('dhl_timer_activity');
                    popup.remove();
                    alert('Atividade salva!');
                };
            }

            const display = document.getElementById('popup-time-display');
            if(display) {
                const update = () => {
                    const st = parseInt(localStorage.getItem('dhl_timer_start'));
                    if(!st) { popup.remove(); return; }
                    const sec = Math.floor((Date.now() - st) / 1000);
                    const h = Math.floor(sec / 3600).toString().padStart(2,'0');
                    const m = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
                    const s = (sec % 60).toString().padStart(2,'0');
                    display.textContent = `${h}:${m}:${s}`;
                };
                update();
                setInterval(update, 1000);
            }
        }
    };

    // --- LÓGICA DE CONFIRMAÇÃO DE EXCLUSÃO ---
    document.getElementById('confirm-delete-btn').onclick = () => {
        if (pendingDeleteProjectId) {
            // Filtra removendo o projeto selecionado
            const projects = getProjects().filter(p => p.id !== pendingDeleteProjectId);
            saveProjects(projects);
            
            // Atualiza a tela
            populateFilters();
            renderTable();
            
            // Limpa a variável
            pendingDeleteProjectId = null;
        }
        // Fecha o modal
        document.getElementById('delete-confirm-modal').classList.add('hidden');
    };
    checkFloatingTimer();
    setInterval(checkFloatingTimer, 2000);

    // Init
    populateFilters();
    renderTable();
});
