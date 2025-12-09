/**
 * PROJECT_SCRIPT.JS - Gerenciamento de Projetos com Supabase
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 0. CONFIGURAÇÃO SUPABASE
    // ==========================================
    const supabaseUrl = 'https://gmepchrmdseulnlayyzi.supabase.co'; 
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZXBjaHJtZHNldWxubGF5eXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMjY3MjYsImV4cCI6MjA4MDgwMjcyNn0.7wtAoP3cvz6Q93WiK1PbQAWtYQGGc1GIcN07oBylrv8';
    const dbClient = supabase.createClient(supabaseUrl, supabaseKey);

    let isProjectsExpanded = false;
    let pendingDeleteProjectId = null;
    let localProjectsCache = []; // Cache local para filtros rápidos
    let timerInterval = null; // Controle do intervalo do timer

    // ==========================================
    // 1. GESTÃO DE USUÁRIO (Recuperar Sessão)
    // ==========================================
    
    let currentUser = null;
    try {
        currentUser = JSON.parse(localStorage.getItem('dhl_active_user'));
    } catch(e) { console.error("Erro user", e); }

    if (!currentUser || !currentUser.email) {
        window.location.href = 'index.html';
        return;
    }

    // Função auxiliar para notificação (Toast)
    const showNotification = (msg, type='info') => {
        const existing = document.querySelector('.notification'); if(existing) existing.remove();
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;
        notif.style.position = 'fixed'; notif.style.top = '80px'; notif.style.left = '50%'; 
        notif.style.transform = 'translateX(-50%)'; notif.style.background = type==='success'?'#198754':'#dc3545';
        notif.style.color='white'; notif.style.padding='10px 20px'; notif.style.borderRadius='20px'; notif.style.zIndex='9999';
        notif.textContent = msg;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
    };
    const formatTime = (totalSec) => {
        const h = Math.floor(totalSec / 3600).toString().padStart(2,'0');
        const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2,'0');
        const s = (totalSec % 60).toString().padStart(2,'0');
        return `${h}:${m}:${s}`;
    };


    // ==========================================
    // 2. FUNÇÕES DE BANCO DE DADOS (PROJETOS)
    // ==========================================

    // Buscar Projetos
    const fetchProjects = async () => {
        // Busca todos os projetos (sem filtro de usuário, conforme padrão de pipeline visível)
        // Se quiser filtrar apenas do usuário logado: .eq('created_by_email', currentUser.email)
        const { data, error } = await dbClient
            .from('projects')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            console.error("Erro ao buscar projetos:", error);
            showNotification("Erro ao carregar projetos.", "error");
            return [];
        }
        
        localProjectsCache = data; // Atualiza cache
        return data;
    };
    
    const saveTimerToDB = async () => {
        const start = localStorage.getItem('dhl_timer_start');
        const activity = localStorage.getItem('dhl_timer_activity');
        
        if (start && activity) {
            const seconds = Math.floor((Date.now() - parseInt(start)) / 1000);
            const dataIso = new Date().toISOString();
            const duracaoStr = formatTime(seconds);

            const { error } = await dbClient
                .from('time_tracker')
                .insert({
                    email: currentUser.email,
                    atividade: activity,
                    duracao: duracaoStr,
                    criado_em: dataIso,
                    status: 'Pendente'
                });

            if (error) {
                console.error("Erro ao salvar timer:", error);
                alert("Erro ao salvar atividade. Verifique a conexão.");
                return false;
            }
            
            // Limpa o timer local após salvar com sucesso
            localStorage.removeItem('dhl_timer_start');
            localStorage.removeItem('dhl_timer_activity');
            return true;
        }
        return false;
    };

    // Função que verifica e desenha o popup
    const checkFloatingTimer = () => {
        const start = localStorage.getItem('dhl_timer_start');
        const activity = localStorage.getItem('dhl_timer_activity');
        
        let popup = document.getElementById('global-timer-popup');

        if (start) {
            // Se o timer existe e o popup não está na tela, cria ele
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'global-timer-popup';
                popup.className = 'timer-popup'; // Usa o CSS que já definimos
                popup.innerHTML = `
                    <div class="timer-popup-content">
                        <span class="timer-popup-label">Em andamento...</span>
                        <div class="timer-popup-time" id="popup-time-display">00:00:00</div>
                        <div class="timer-popup-activity" title="${activity}">${activity}</div>
                    </div>
                    <button class="timer-popup-btn" id="popup-stop-btn" title="Parar e Salvar">
                        <i class="fas fa-stop"></i>
                    </button>
                `;
                document.body.appendChild(popup);

                // Ação do Botão Parar no Popup
                document.getElementById('popup-stop-btn').onclick = async () => {
                    document.getElementById('popup-stop-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Loading
                    const saved = await saveTimerToDB();
                    if(saved) {
                        popup.remove();
                        showNotification("Atividade salva!", "success");
                    }
                };
            }

            // Atualiza o tempo no popup
            const updateDisplay = () => {
                const startTime = parseInt(localStorage.getItem('dhl_timer_start'));
                if(!startTime) return;
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const display = document.getElementById('popup-time-display');
                if(display) display.textContent = formatTime(elapsed);
            };
            
            updateDisplay();
            // Garante que não criamos múltiplos intervalos
            if (!timerInterval) timerInterval = setInterval(updateDisplay, 1000);

        } else {
            // Se não tem timer rodando mas o popup existe, remove ele
            if (popup) {
                popup.remove();
                if(timerInterval) clearInterval(timerInterval);
                timerInterval = null;
            }
        }
    };

    // ==========================================
    // 3. LOGOUT INTELIGENTE (Salva antes de sair)
    // ==========================================
    document.getElementById('logout-btn').onclick = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('logout-btn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saindo...';

        // Se tiver timer rodando, salva antes de sair
        if (localStorage.getItem('dhl_timer_start')) {
            await saveTimerToDB();
        }

        // Limpa sessão
        localStorage.removeItem('dhl_active_user');
        localStorage.removeItem('usuarioLogado');
        
        // Redireciona
        window.location.href = 'index.html';
    };
    // Salvar Projeto (Novo ou Edição)
    const saveProjectToDB = async (projectData, id = null) => {
        // Tratamento de datas vazias para NULL (Postgres não aceita string vazia em campo Date)
        const cleanData = {
            ...projectData,
            start_date: projectData.start_date || null,
            deadline: projectData.deadline || null,
            completion_date: projectData.completion_date || null,
            estimated_hours: projectData.estimated_hours || 0,
            monetization: projectData.monetization || 0
        };

        let error;
        if (id) {
            // Update
            const { error: err } = await dbClient
                .from('projects')
                .update(cleanData)
                .eq('id', id);
            error = err;
        } else {
            // Insert
            const { error: err } = await dbClient
                .from('projects')
                .insert([{
                    ...cleanData,
                    created_by_email: currentUser.email // Vincula ao criador
                }]);
            error = err;
        }

        if (error) {
            console.error("Erro ao salvar:", error);
            showNotification("Erro ao salvar projeto: " + error.message, "error");
            return false;
        }
        return true;
    };

    // Excluir Projeto
    const deleteProjectFromDB = async (id) => {
        const { error } = await dbClient
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) {
            showNotification("Erro ao excluir: " + error.message, "error");
            return false;
        }
        return true;
    };

    // ==========================================
    // 3. UI LÓGICA & TABELA
    // ==========================================

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    // --- POPULA FILTROS ---
    const populateFilters = () => {
        const users = new Set();
        const areas = new Set();
        
        localProjectsCache.forEach(p => {
            if(p.responsible) users.add(p.responsible);
            if(p.area) areas.add(p.area);
        });

        const userSelect = document.getElementById('filter-user');
        const currentU = userSelect.value;
        userSelect.innerHTML = '<option value="">Responsible: All</option>';
        Array.from(users).sort().forEach(u => userSelect.appendChild(new Option(u, u)));
        if(users.has(currentU)) userSelect.value = currentU;

        const areaSelect = document.getElementById('filter-area');
        const currentA = areaSelect.value;
        areaSelect.innerHTML = '<option value="">Area: All</option>';
        Array.from(areas).sort().forEach(a => areaSelect.appendChild(new Option(a, a)));
        if(areas.has(currentA)) areaSelect.value = currentA;
    };

    // --- RENDERIZAÇÃO DA TABELA ---
    const toggleFilterBtn = document.getElementById('toggle-filters-btn');
    const filtersContainer = document.querySelector('.filters-row'); // Ou id='filters-container' se você adicionou o ID no HTML
    
    if(toggleFilterBtn) {
        toggleFilterBtn.onclick = () => {
            filtersContainer.classList.toggle('show-mobile');
            // Alterna ícone
            const icon = toggleFilterBtn.querySelector('.fa-chevron-down, .fa-chevron-up');
            if(icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        };
    }

    // RENDER TABLE ATUALIZADA COM DATA-LABEL
    const renderTable = async (refreshData = false) => {
        const tbody = document.querySelector('#projects-table tbody');
        
        if (refreshData) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center">Carregando...</td></tr>';
            await fetchProjects();
        }

        const searchText = document.getElementById('search-project').value.toLowerCase();
        const statusFilter = document.getElementById('filter-status').value;
        const userFilter = document.getElementById('filter-user').value.toLowerCase();
        const areaFilter = document.getElementById('filter-area').value.toLowerCase();

        const filteredProjects = localProjectsCache.filter(p => {
            const matchesText = (p.name||'').toLowerCase().includes(searchText) || (p.site||'').toLowerCase().includes(searchText);
            const matchesStatus = statusFilter === "" || p.status === statusFilter;
            const matchesUser = userFilter === "" || (p.owner||'').toLowerCase() === userFilter || (p.responsible||'').toLowerCase() === userFilter;
            const matchesArea = areaFilter === "" || (p.area||'').toLowerCase() === areaFilter;
            return matchesText && matchesStatus && matchesUser && matchesArea;
        });

        // Atualiza Stats (igual ao anterior)
        // ... (seu código de stats aqui) ...

        tbody.innerHTML = '';
        const LIMIT = 6;
        const itemsToShow = isProjectsExpanded ? filteredProjects : filteredProjects.slice(0, LIMIT);

        if (itemsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="text-center" style="padding:2rem;">Nenhum projeto encontrado.</td></tr>';
            return;
        }

        itemsToShow.forEach(p => {
            let statusClass = 'badge-gray';
            if (p.status === 'In Progress') statusClass = 'badge-blue';
            if (p.status === 'Completed') statusClass = 'badge-green';
            if (p.status === 'On Hold') statusClass = 'badge-yellow';
            if (p.status === 'Cancelled') statusClass = 'badge-red';

            const tr = document.createElement('tr');
            
            // AQUI ESTÁ O TRUQUE: data-label em cada TD
            tr.innerHTML = `
                <td class="id-column" data-label="ID">#${p.id}</td>
                <td class="font-bold" data-label="Projeto">${p.name}</td>
                <td data-label="Site">${p.site || '-'}</td>
                <td data-label="Status"><span class="badge ${statusClass}">${p.status || '-'}</span></td>
                <td data-label="Progresso">
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:10px;">
                        <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${p.progress || 0}%"></div></div>
                        <small>${p.progress || 0}%</small>
                    </div>
                </td>
                <td data-label="Categoria">${p.category || '-'}</td>
                <td data-label="Área">${p.area || '-'}</td>
                <td data-label="Complexidade">${p.complexity || '-'}</td>
                <td data-label="Solicitante">${p.requester || '-'}</td>
                <td data-label="Responsável">${p.responsible || '-'}</td>
                <td data-label="Início">${p.start_date ? new Date(p.start_date).toLocaleDateString() : '-'}</td> 
                <td data-label="Entrega">${p.completion_date ? new Date(p.completion_date).toLocaleDateString() : '-'}</td>
                <td data-label="Horas Est.">${p.estimated_hours || 0}h</td>
                <td data-label="Monetização">${formatCurrency(p.monetization)}</td>
                <td data-label="Comentários">
                    ${p.comments ? `<button class="icon-btn" onclick="showComment('${encodeURIComponent(p.comments)}')"><i class="fas fa-comment"></i> Ver</button>` : '-'}
                </td>
                <td data-label="Ações">
                    <button class="icon-btn" onclick="editProject(${p.id})"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn" onclick="deleteProject(${p.id})"><i class="fas fa-trash text-danger"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });


        // 5. Botão Ver Mais
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
                renderTable(false);
            };
            btnDiv.appendChild(btn);
            cardSection.appendChild(btnDiv);
        } else {
            if(filteredProjects.length <= LIMIT && isProjectsExpanded) isProjectsExpanded = false;
        }

        populateFilters(); // Atualiza filtros com base nos dados carregados
    };

    // ==========================================
    // 4. FUNÇÕES GLOBAIS (MODAIS E AÇÕES)
    // ==========================================

    window.showComment = (encodedComment) => {
        document.getElementById('full-comment-text').textContent = decodeURIComponent(encodedComment);
        document.getElementById('comment-view-modal').classList.remove('hidden');
    };

    window.editProject = (id) => {
        const p = localProjectsCache.find(x => x.id === id);
        if(!p) return;
        
        // Mapeia DB -> Form
        document.getElementById('p-id').value = p.id;
        document.getElementById('p-name').value = p.name;
        document.getElementById('p-site').value = p.site;
        document.getElementById('p-status').value = p.status;
        document.getElementById('p-progress').value = p.progress;
        document.getElementById('p-complexity').value = p.complexity;
        document.getElementById('p-category').value = p.category;
        document.getElementById('p-area').value = p.area;
        document.getElementById('p-system').value = p.system;
        document.getElementById('p-owner').value = p.owner;
        document.getElementById('p-responsible').value = p.responsible;
        document.getElementById('p-requester').value = p.requester;
        document.getElementById('p-start-date').value = p.start_date;
        document.getElementById('p-deadline').value = p.deadline;
        document.getElementById('p-completion-date').value = p.completion_date;
        document.getElementById('p-hours').value = p.estimated_hours;
        document.getElementById('p-money').value = p.monetization;
        document.getElementById('p-comments').value = p.comments;
        
        document.getElementById('modal-title').textContent = 'Editar Projeto';
        document.getElementById('project-modal').classList.remove('hidden');
    };

    window.deleteProject = (id) => {
        pendingDeleteProjectId = id;
        document.getElementById('delete-confirm-modal').classList.remove('hidden');
    };

    // Botão Novo Projeto
    document.getElementById('btn-new-project').onclick = () => {
        document.getElementById('project-form').reset();
        document.getElementById('p-id').value = '';
        document.getElementById('modal-title').textContent = 'Novo Projeto';
        document.getElementById('project-modal').classList.remove('hidden');
    };

    // Fechar Modais
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
        btn.onclick = function() { this.closest('.modal').classList.add('hidden'); };
    });

    // --- FORMULÁRIO DE PROJETO (SUBMIT) ---
    document.getElementById('project-form').onsubmit = async (e) => {
        e.preventDefault();
        
        const idField = document.getElementById('p-id').value;
        const id = idField ? parseInt(idField) : null;
        
        // Mapeia Form -> DB Object (snake_case)
        const projectData = {
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
            start_date: document.getElementById('p-start-date').value,
            deadline: document.getElementById('p-deadline').value,
            completion_date: document.getElementById('p-completion-date').value,
            estimated_hours: document.getElementById('p-hours').value,
            monetization: document.getElementById('p-money').value,
            comments: document.getElementById('p-comments').value
        };

        const success = await saveProjectToDB(projectData, id);

        if (success) {
            document.getElementById('project-modal').classList.add('hidden');
            showNotification(id ? "Projeto atualizado!" : "Projeto criado!", "success");
            renderTable(true); // Recarrega do banco
        }
    };

    // --- CONFIRMAR EXCLUSÃO ---
    document.getElementById('confirm-delete-btn').onclick = async () => {
        if (pendingDeleteProjectId) {
            const success = await deleteProjectFromDB(pendingDeleteProjectId);
            if(success) {
                showNotification("Projeto excluído.", "success");
                renderTable(true);
            }
            pendingDeleteProjectId = null;
        }
        document.getElementById('delete-confirm-modal').classList.add('hidden');
    };

    // --- FILTROS ---
    document.getElementById('search-project').oninput = () => renderTable(false); // Filtra local
    document.getElementById('filter-status').onchange = () => renderTable(false);
    document.getElementById('filter-user').onchange = () => renderTable(false);
    document.getElementById('filter-area').onchange = () => renderTable(false);
    document.getElementById('btn-export-projects').onclick = () => {
        if(typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();
            // Exporta o cache local que reflete o banco
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(localProjectsCache), "Projetos");
            XLSX.writeFile(wb, "Projetos_DHL.xlsx");
        } else {
            alert('Erro: Biblioteca XLSX não carregada.');
        }
    };

    // ==========================================
    // 5. ATUALIZAÇÃO DE PERFIL DO USUÁRIO
    // (Lógica replicada do App.js para consistência)
    // ==========================================
    
    // Atualiza a UI do Header
    const updateUserUI = () => {
        if(!currentUser) return;
        document.getElementById('header-username').textContent = currentUser.name || currentUser.email;
        const ddName = document.getElementById('dropdown-name');
        if(ddName) ddName.textContent = currentUser.name || currentUser.email;
        const ddEmail = document.getElementById('dropdown-email');
        if(ddEmail) ddEmail.textContent = currentUser.email;

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

    // Função para atualizar BD de Usuários
    const updateUserProfileInDB = async (updates) => {
        const { passwordHash, ...safeUpdates } = updates;
        
        // Remove hash_ prefixo se existir (caso tenha lógica de hash simulada)
        if (passwordHash) safeUpdates.password = passwordHash.replace('hash_', '');

        const { error } = await dbClient
            .from('users')
            .update(safeUpdates)
            .eq('email', currentUser.email);

        if (error) {
            console.error(error);
            return false;
        }
        return true;
    };

    // Carregar Perfil Recente (Igual App.js)
    async function loadUserProfile() {
        const { data } = await dbClient.from('users').select('*').eq('email', currentUser.email).single();
        if (data) {
            currentUser = { ...currentUser, ...data };
            if (data.name && data.name.trim() !== '') {
                currentUser.name = data.name;
            } else {
                currentUser.name = data.email; 
            }
            localStorage.setItem('dhl_active_user', JSON.stringify(currentUser));
            updateUserUI();
        }
    }

    // -- Eventos do Modal de Perfil --
    let pendingProfileUpdates = null;

    document.getElementById('open-unified-modal').onclick = (e) => {
        e.preventDefault();
        // Preenche campos
        document.getElementById('edit-name').value = currentUser.name || '';
        document.getElementById('edit-email').value = currentUser.email || '';
        document.getElementById('edit-bio').value = currentUser.bio || '';
        document.getElementById('edit-dept').value = currentUser.dept || '';
        document.getElementById('edit-role').value = currentUser.role || '';
        document.getElementById('edit-phone').value = currentUser.phone || '';
        
        const largeImg = document.getElementById('profile-image-large');
        largeImg.src = (currentUser.avatar && currentUser.avatar.length > 50) 
            ? currentUser.avatar 
            : 'https://raw.githubusercontent.com/wuelnerdotexe/DHL-clone/main/src/assets/default-user.png';
        
        document.getElementById('unified-profile-modal').classList.remove('hidden');
    };

    document.getElementById('unified-profile-form').onsubmit = (e) => {
        e.preventDefault();
        const updates = {
            name: document.getElementById('edit-name').value,
            bio: document.getElementById('edit-bio').value,
            dept: document.getElementById('edit-dept').value,
            role: document.getElementById('edit-role').value,
            phone: document.getElementById('edit-phone').value,
            email: document.getElementById('edit-email').value
        };
        const newPassInput = document.getElementById('edit-new-password').value;
        if(newPassInput && newPassInput.trim() !== "") {
            updates.passwordHash = newPassInput; // Envia direto (cuidado em prod)
        }
        const fileInput = document.getElementById('profile-image-input');
        if(fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                updates.avatar = evt.target.result;
                triggerPasswordChallenge(updates); 
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            triggerPasswordChallenge(updates);
        }
    };

    const triggerPasswordChallenge = (updates) => {
        pendingProfileUpdates = updates;
        document.getElementById('challenge-password-input').value = '';
        document.getElementById('challenge-error').classList.add('hidden');
        document.getElementById('password-challenge-modal').classList.remove('hidden');
    };

    document.getElementById('confirm-save-btn').onclick = async () => {
        const pwdInput = document.getElementById('challenge-password-input').value;
        const errorMsg = document.getElementById('challenge-error');

        if(!pwdInput) {
            errorMsg.textContent = "Digite sua senha.";
            errorMsg.classList.remove('hidden'); return;
        }
        
        // Verifica senha (localmente contra o objeto carregado)
        if(currentUser.password !== pwdInput) {
            errorMsg.textContent = "Senha incorreta.";
            errorMsg.classList.remove('hidden'); return;
        }

        const success = await updateUserProfileInDB(pendingProfileUpdates);
        if(success) {
            await loadUserProfile();
            document.getElementById('password-challenge-modal').classList.add('hidden');
            document.getElementById('unified-profile-modal').classList.add('hidden');
            document.getElementById('success-modal').classList.remove('hidden');
            document.getElementById('edit-new-password').value = '';
        } else {
            showNotification("Erro ao atualizar perfil.", "error");
        }
        pendingProfileUpdates = null;
    };

    // Fechar modais extras
    document.getElementById('close-all-modals-btn').onclick = () => document.getElementById('success-modal').classList.add('hidden');
    document.querySelectorAll('.close-challenge-btn').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('password-challenge-modal').classList.add('hidden');
            pendingProfileUpdates = null;
        };
    });

    // ==========================================
    // 6. INICIALIZAÇÃO
    // ==========================================
    
    // Modo Escuro
    document.getElementById('dark-mode-toggle').onclick = () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('dhl_dark_mode', document.body.classList.contains('dark-mode'));
    };
    if(localStorage.getItem('dhl_dark_mode') === 'true') document.body.classList.add('dark-mode');

    document.getElementById('user-menu-btn').onclick = () => document.getElementById('user-dropdown').classList.toggle('hidden');

    // --- LOGOUT (project_script.js) ---
    document.getElementById('logout-btn').onclick = () => {
        // Limpa sessão
        localStorage.removeItem('dhl_active_user');
        localStorage.removeItem('usuarioLogado'); // Garante que limpa a chave do auth.js também
        
        // Limpa o Timer (para não aparecer o popup flutuante para o próximo usuário)
        localStorage.removeItem('dhl_timer_start');
        localStorage.removeItem('dhl_timer_activity');
        
        window.location.href = 'index.html';
    };

    // Start
    loadUserProfile(); // Carrega user e atualiza header
    renderTable(true); // Carrega projetos do Supabase
    
    setInterval(checkFloatingTimer, 1000);
});
