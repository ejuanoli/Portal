/**
 * APP.JS - Gerencia Time Tracker com Integração Supabase
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 0. CONFIGURAÇÃO SUPABASE & SESSÃO
    // ==========================================
    const supabaseUrl = 'https://gmepchrmdseulnlayyzi.supabase.co'; 
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtZXBjaHJtZHNldWxubGF5eXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMjY3MjYsImV4cCI6MjA4MDgwMjcyNn0.7wtAoP3cvz6Q93WiK1PbQAWtYQGGc1GIcN07oBylrv8';
    const dbClient = supabase.createClient(supabaseUrl, supabaseKey);

    // 1. Verifica Sessão
    const userEmail = localStorage.getItem('usuarioLogado');
    if (!userEmail) {
        window.location.href = 'index.html';
        return;
    }

    // Variável para armazenar dados do usuário atual
    let currentUser = {
        name: 'Carregando...',
        email: userEmail,
        avatar: '',
        bio: '',
        dept: '',
        role: '',
        phone: ''
    };

    // Lógica do botão de filtro no Time Tracker
    const ttFilterBtn = document.getElementById('toggle-filters-btn');
    const ttWrapper = document.getElementById('tt-filter-wrapper');
    const ttIcon = document.getElementById('tt-filter-icon');

    if(ttFilterBtn && ttWrapper) {
        ttFilterBtn.onclick = () => {
            ttWrapper.classList.toggle('active');
            if(ttWrapper.classList.contains('active')){
                ttIcon.classList.replace('fa-chevron-down', 'fa-chevron-up');
            } else {
                ttIcon.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        };
    }
    // ==========================================
    // 1. HELPERS (Formatadores e UI)
    // ==========================================
    const formatTime = (totalSec) => {
        const h = Math.floor(totalSec / 3600).toString().padStart(2,'0');
        const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2,'0');
        const s = (totalSec % 60).toString().padStart(2,'0');
        return `${h}:${m}:${s}`;
    };

    const timeToSeconds = (timeStr) => {
        if(!timeStr) return 0;
        const p = timeStr.split(':').map(Number);
        return (p.length === 3) ? p[0]*3600 + p[1]*60 + p[2] : (p.length===2 ? p[0]*3600+p[1]*60 : 0);
    };

    const parseLocalDate = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    // --- NOTIFICAÇÃO ORIGINAL RESTAURADA ---
    const showNotification = (msg, type='info') => {
        const existing = document.querySelector('.notification'); if(existing) existing.remove();
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;
        
        // Ícones baseados no tipo
        const icon = type==='success'
            ? '<i class="fas fa-check-circle"></i>'
            : (type==='error' ? '<i class="fas fa-exclamation-triangle"></i>' : '<i class="fas fa-info-circle"></i>');
        
        notif.innerHTML = `${icon} <span>${msg}</span>`;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3500);
    };
    // ----------------------------------------

    const toggleModal = (modal, show=true) => {
        if(!modal) return;
        if(show) { 
            modal.classList.remove('hidden'); 
            const dd = document.getElementById('user-dropdown'); if(dd) dd.classList.add('hidden');
        } else { 
            modal.classList.add('hidden'); 
        }
    };

    const getFinalActivity = (sel, inp) => (sel.value === 'custom_opt_val') ? inp.value.trim() : sel.value;

    // ==========================================
    // 2. FUNÇÕES DE BANCO DE DADOS (SUPABASE)
    // ==========================================
    
    // Carregar Perfil
    async function loadUserProfile() {
        // Busca os dados no Supabase
        const { data, error } = await dbClient
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();
    
        if (data) {
            // Mescla os dados do banco com o objeto local
            currentUser = { ...currentUser, ...data };
    
            // === LÓGICA SOLICITADA ===
            // Se existir 'name' e não for vazio, usa o nome.
            // Caso contrário, usa o próprio email.
            if (data.name && data.name.trim() !== '') {
                currentUser.name = data.name;
            } else {
                currentUser.name = data.email; 
            }
    
            // Atualiza o LocalStorage também para garantir que a página de Projetos (projects.html) pegue a mudança
            localStorage.setItem('dhl_active_user', JSON.stringify(currentUser));
            
            // Atualiza a tela
            updateUI();
        } else {
            console.error("Erro ao carregar perfil:", error);
        }
    }

    // Carregar Histórico
    async function fetchEntries() {
        const { data, error } = await dbClient
            .from('time_tracker')
            .select('*')
            .eq('email', userEmail)
            .order('criado_em', { ascending: false });

        if (error) {
            console.error("Erro ao buscar histórico:", error);
            return [];
        }

        return data.map(row => ({
            id: row.id,
            activity: row.atividade,
            seconds: timeToSeconds(row.duracao),
            timestamp: new Date(row.criado_em).getTime(),
            exported: row.status === 'Concluído'
        }));
    }

    // Adicionar
    async function addEntryToDB(activity, seconds, timestamp) {
        const duracaoStr = formatTime(seconds);
        const dataIso = new Date(timestamp).toISOString();

        const { error } = await dbClient
            .from('time_tracker')
            .insert({
                email: userEmail,
                atividade: activity,
                duracao: duracaoStr,
                criado_em: dataIso,
                status: 'Pendente'
            });

        if (error) {
            showNotification('Erro ao salvar: ' + error.message, 'error');
            return false;
        }
        return true;
    }

    // Editar
    async function updateEntryInDB(id, activity, seconds, timestamp) {
        const duracaoStr = formatTime(seconds);
        const dataIso = new Date(timestamp).toISOString();

        const { error } = await dbClient
            .from('time_tracker')
            .update({
                atividade: activity,
                duracao: duracaoStr,
                criado_em: dataIso
            })
            .eq('id', id);

        if (error) {
            showNotification('Erro ao editar: ' + error.message, 'error');
            return false;
        }
        return true;
    }

    // Excluir
    async function deleteEntryFromDB(id) {
        const { error } = await dbClient
            .from('time_tracker')
            .delete()
            .eq('id', id);

        if (error) {
            showNotification('Erro ao excluir: ' + error.message, 'error');
            return false;
        }
        return true;
    }

    // Marcar como Exportado
    async function markAsExportedInDB(entries) {
        const ids = entries.map(e => e.id);
        await dbClient
            .from('time_tracker')
            .update({ status: 'Concluído' })
            .in('id', ids);
    }

    // Atualizar Perfil
    async function updateUserProfileInDB(updates) {
        const { passwordHash, ...safeUpdates } = updates;
        
        if (passwordHash) {
            safeUpdates.password = passwordHash.replace('hash_', '');
        }

        const { error } = await dbClient
            .from('users')
            .update(safeUpdates)
            .eq('email', userEmail);

        if (error) {
            console.error(error);
            return false;
        }
        return true;
    }

    // ==========================================
    // 3. UI & LÓGICA DO APP
    // ==========================================

    let timerInterval = null;
    let isHistoryExpanded = false;
    let pendingDeleteId = null;
    let currentViewMode = 'detailed'; 
    const activitiesList = ['Reunião', 'Desenvolvimento', 'Email/Admin', 'Intervalo', 'Planejamento', 'Suporte'];
    const CUSTOM_OPTION_VALUE = 'custom_opt_val';

    const updateUI = () => {
        // Atualiza o nome no Header
        const headerNameEl = document.getElementById('header-username');
        if (headerNameEl) {
            // Exibe o nome. Como tratamos no loadUserProfile, aqui já estará correto (Nome ou Email)
            headerNameEl.textContent = currentUser.name; 
        }
    
        // Atualiza Avatar no Header
        const avatarImg = document.getElementById('header-avatar');
        if (avatarImg) {
            if (currentUser.avatar && currentUser.avatar.length > 50) {
                avatarImg.src = currentUser.avatar;
                avatarImg.classList.remove('avatar-placeholder');
            } else {
                // Placeholder padrão se não tiver foto
                avatarImg.src = 'https://static.vecteezy.com/system/resources/previews/024/983/914/non_2x/simple-user-default-icon-free-png.png';
            }
        }
    
        // Atualiza o Dropdown (Menu de usuário)
        const ddName = document.getElementById('dropdown-name');
        if (ddName) ddName.textContent = currentUser.name;
        
        const ddEmail = document.getElementById('dropdown-email');
        if (ddEmail) ddEmail.textContent = currentUser.email;
    };

    const setupSelects = () => {
        const sets = [
            { sel: document.getElementById('activity-select'), inp: document.getElementById('custom-activity-main') },
            { sel: document.getElementById('manual-activity-select'), inp: document.getElementById('manual-custom-activity') },
            { sel: document.getElementById('edit-activity-select'), inp: null }
        ];

        sets.forEach(({ sel, inp }) => {
            if(!sel) return;
            sel.innerHTML = '<option value="" disabled selected>Selecione a atividade...</option>';
            activitiesList.forEach(act => sel.appendChild(new Option(act, act)));
            
            const opt = new Option('Outra / Personalizada', CUSTOM_OPTION_VALUE);
            opt.style.color = '#fffff'; opt.style.fontWeight = 'bold';
            sel.appendChild(opt);

            sel.onchange = () => {
                if (inp) {
                    if(sel.value === CUSTOM_OPTION_VALUE) { 
                        inp.classList.remove('hidden'); 
                        inp.value = ''; 
                        inp.focus(); 
                    } else { 
                        inp.classList.add('hidden'); 
                        inp.value = ''; 
                    }
                }
            };
        });
    };

    // --- CRONÔMETRO ---
    const timerDisplay = document.getElementById('timer-display');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const activitySelect = document.getElementById('activity-select');
    const customActivity = document.getElementById('custom-activity-main');

    const updateTimerDisplay = () => {
        const start = localStorage.getItem('dhl_timer_start');
        if (start && timerDisplay) {
            const elapsed = Math.floor((Date.now() - parseInt(start)) / 1000);
            timerDisplay.textContent = formatTime(elapsed);
        }
    };

    const checkActiveTimer = () => {
        const start = localStorage.getItem('dhl_timer_start');
        const activity = localStorage.getItem('dhl_timer_activity');

        if (start) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            activitySelect.disabled = true;
            customActivity.disabled = true;

            if(activity && activitySelect) {
                let found = false;
                Array.from(activitySelect.options).forEach(opt => {
                    if(opt.value === activity) {
                        activitySelect.value = activity;
                        found = true;
                    }
                });
                if(!found) {
                    activitySelect.value = CUSTOM_OPTION_VALUE;
                    customActivity.classList.remove('hidden');
                    customActivity.value = activity;
                }
            }
            if(timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimerDisplay, 1000);
            updateTimerDisplay(); 
        } else {
            timerDisplay.textContent = '00:00:00';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            activitySelect.disabled = false;
            customActivity.disabled = false;
            if(timerInterval) clearInterval(timerInterval);
        }
    };

    startBtn.onclick = () => {
        const act = getFinalActivity(activitySelect, customActivity);
        if(!act) return showNotification('Selecione ou digite a atividade.', 'warning');
        
        localStorage.setItem('dhl_timer_start', Date.now());
        localStorage.setItem('dhl_timer_activity', act);
        checkActiveTimer();
    };

    stopBtn.onclick = async () => {
        const start = localStorage.getItem('dhl_timer_start');
        const act = localStorage.getItem('dhl_timer_activity');
        
        if (start && act) {
            const seconds = Math.floor((Date.now() - parseInt(start)) / 1000);
            
            await addEntryToDB(act, seconds, Date.now());
            
            localStorage.removeItem('dhl_timer_start');
            localStorage.removeItem('dhl_timer_activity');
            
            activitySelect.value = "";
            customActivity.classList.add('hidden');
            customActivity.value = "";
            checkActiveTimer();
            renderHistory();
            showNotification('Atividade salva com sucesso.', 'success');
        }
    };

    // --- HISTÓRICO ---
    const getActiveFilter = () => document.querySelector('#history-filters .filter-btn.active')?.dataset.filter || 'today';

    const renderHistory = async () => {
        const tbody = document.querySelector('#history-table tbody');
        const footerTotal = document.getElementById('history-total-time');
        const section = document.querySelector('.history-section');
        
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando...</td></tr>';
        
        let allEntries = await fetchEntries();

        const filter = getActiveFilter();
        const today = new Date(); today.setHours(0,0,0,0);
        let entries = allEntries;

        if (filter === 'today') {
            entries = entries.filter(e => new Date(e.timestamp) >= today);
        } else if (filter === 'yesterday') {
            const y = new Date(today); y.setDate(y.getDate()-1);
            entries = entries.filter(e => { const d=new Date(e.timestamp); return d>=y && d<today; });
        } else if (filter === 'week') {
            const w = new Date(today); w.setDate(w.getDate() - today.getDay());
            entries = entries.filter(e => new Date(e.timestamp) >= w);
        } else if (filter === 'month') {
            const m = new Date(today.getFullYear(), today.getMonth(), 1);
            entries = entries.filter(e => new Date(e.timestamp) >= m);
        }

        const totalSecs = entries.reduce((acc, c) => acc + c.seconds, 0);
        footerTotal.textContent = formatTime(totalSecs);
        
        const oldBtn = document.querySelector('.view-more-container');
        if(oldBtn) oldBtn.remove();
        
        tbody.innerHTML = '';

        if(entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted);">Nenhum registro encontrado.</td></tr>';
            return;
        }

        const getGroupedEntries = (list) => {
            const grouped = {};
            list.forEach(e => {
                const dateStr = new Date(e.timestamp).toLocaleDateString();
                const key = `${dateStr}:::${e.activity}`;
                if(!grouped[key]) grouped[key] = { date: dateStr, activity: e.activity, seconds: 0, ids: [e.id], rawTime: e.timestamp };
                grouped[key].seconds += e.seconds;
                if(!grouped[key].ids.includes(e.id)) grouped[key].ids.push(e.id);
            });
            return Object.values(grouped).sort((a,b) => b.rawTime - a.rawTime);
        };

        let displayList = (currentViewMode === 'summary') ? getGroupedEntries(entries) : entries;
        const LIMIT = 2;
        const totalItems = displayList.length;
        const itemsToShow = isHistoryExpanded ? displayList : displayList.slice(0, LIMIT);

        itemsToShow.forEach(item => {
            const tr = document.createElement('tr');
            let dateHTML, statusHTML, actionsHTML;

            if (currentViewMode === 'summary') {
                dateHTML = `<strong>${item.date}</strong>`;
                statusHTML = `<span style="color:var(--text-muted); font-size:0.8rem">Agrupado</span>`;
                actionsHTML = `<span style="color:var(--border)">-</span>`;
            } else {
                const d = new Date(item.timestamp);
                dateHTML = `<div>${d.toLocaleDateString()}</div><small style="color:var(--text-muted)">${d.toLocaleTimeString().slice(0,5)}</small>`;
                statusHTML = `<span class="badge ${item.exported?'badge-green':'badge-red'}">${item.exported?'Exportado':'Pendente'}</span>`;
                actionsHTML = `
                    <button class="icon-btn edit-btn" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn del-btn" data-id="${item.id}" title="Excluir"><i class="fas fa-trash"></i></button>`;
            }

            tr.innerHTML = `
            <td data-label="Data">${dateHTML}</td>
            <td data-label="Atividade" class="font-bold">${item.activity}</td>
            <td data-label="Duração" style="font-family:monospace; font-weight:bold">${formatTime(item.seconds)}</td>
            <td data-label="Status">${statusHTML}</td>
            <td data-label="Ações">${actionsHTML}</td>
        `;
        tbody.appendChild(tr);
    });

        if(totalItems > LIMIT) {
            const btnDiv = document.createElement('div');
            btnDiv.className = 'view-more-container';
            const btn = document.createElement('button');
            btn.className = 'btn-view-more';
            btn.innerHTML = isHistoryExpanded ? 'Ver menos <i class="fas fa-chevron-up"></i>' : `Ver mais (${totalItems - LIMIT}) <i class="fas fa-chevron-down"></i>`;
            btn.onclick = () => { isHistoryExpanded = !isHistoryExpanded; renderHistory(); };
            btnDiv.appendChild(btn);
            section.appendChild(btnDiv);
        }

        if(currentViewMode !== 'summary') {
            document.querySelectorAll('.del-btn').forEach(btn => {
                btn.onclick = (e) => {
                    pendingDeleteId = parseInt(e.currentTarget.dataset.id);
                    toggleModal(document.getElementById('delete-confirm-modal'));
                };
            });
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = parseInt(e.currentTarget.dataset.id);
                    await openEditModal(id);
                };
            });
        }
    };

    // --- AÇÕES MANUAIS E MODAIS ---
    const btnManual = document.getElementById('btn-open-manual');
    if(btnManual) {
        btnManual.onclick = () => {
            const now = new Date();
            const localIso = new Date(now - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            document.getElementById('manual-date-input').value = localIso;
            toggleModal(document.getElementById('manual-modal'));
        };

        document.getElementById('manual-entry-form').onsubmit = async (e) => {
            e.preventDefault();
            const act = getFinalActivity(document.getElementById('manual-activity-select'), document.getElementById('manual-custom-activity'));
            const sec = timeToSeconds(document.getElementById('manual-time-input').value);
            const dateInput = document.getElementById('manual-date-input').value;
            
            const d = parseLocalDate(dateInput); 
            const now = new Date(); 
            d.setHours(now.getHours(), now.getMinutes(), now.getSeconds()); 
            
            await addEntryToDB(act, sec, d.getTime());
            
            toggleModal(document.getElementById('manual-modal'), false);
            e.target.reset(); 
            document.getElementById('manual-custom-activity').classList.add('hidden');
            renderHistory();
            showNotification('Registro manual adicionado.', 'success');
        };
    }

    const openEditModal = async (id) => {
        const entries = await fetchEntries();
        const entry = entries.find(e => e.id === id);
        if(!entry) return;
        
        const dateObj = new Date(entry.timestamp);
        const localIso = new Date(dateObj - (dateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        
        document.getElementById('edit-timestamp').value = entry.id; 
        document.getElementById('edit-date').value = localIso;
        document.getElementById('edit-time').value = formatTime(entry.seconds);
        
        const editSel = document.getElementById('edit-activity-select');
        editSel.value = entry.activity;
        if(editSel.selectedIndex === -1) {
             const opt = new Option(entry.activity, entry.activity, true, true);
             editSel.add(opt);
        }
        toggleModal(document.getElementById('edit-modal'));
    };

    document.getElementById('edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('edit-timestamp').value);
        const newDateVal = document.getElementById('edit-date').value;
        const newTimeVal = document.getElementById('edit-time').value;
        const newAct = document.getElementById('edit-activity-select').value;
        
        const seconds = timeToSeconds(newTimeVal);
        const d = parseLocalDate(newDateVal);
        d.setHours(12,0,0);

        await updateEntryInDB(id, newAct, seconds, d.getTime());
        
        toggleModal(document.getElementById('edit-modal'), false);
        renderHistory();
        showNotification('Registro atualizado.', 'success');
    };

    document.getElementById('confirm-delete-btn').onclick = async () => {
        if(pendingDeleteId) {
            await deleteEntryFromDB(pendingDeleteId);
            renderHistory();
            showNotification('Registro excluído.', 'success');
        }
        toggleModal(document.getElementById('delete-confirm-modal'), false);
    };

    // --- PERFIL ---
    let pendingProfileUpdates = null;

    document.getElementById('open-unified-modal').onclick = (e) => {
        e.preventDefault();
        document.getElementById('edit-name').value = currentUser.name || '';
        document.getElementById('edit-email').value = currentUser.email || '';
        document.getElementById('edit-bio').value = currentUser.bio || '';
        document.getElementById('edit-dept').value = currentUser.dept || '';
        document.getElementById('edit-role').value = currentUser.role || '';
        document.getElementById('edit-phone').value = currentUser.phone || '';
        
        if(currentUser.avatar && currentUser.avatar.length > 50) {
            document.getElementById('profile-image-large').src = currentUser.avatar;
        } else {
            document.getElementById('profile-image-large').src = 'https://static.vecteezy.com/system/resources/previews/024/983/914/non_2x/simple-user-default-icon-free-png.png';
        }
        
        toggleModal(document.getElementById('unified-profile-modal'));
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
            updates.passwordHash = 'hash_' + newPassInput; 
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
        document.getElementById('challenge-password-input').focus();
    };

    document.getElementById('confirm-save-btn').onclick = async () => {
        const pwdInput = document.getElementById('challenge-password-input').value;
        const errorMsg = document.getElementById('challenge-error');

        if(!pwdInput) {
            errorMsg.textContent = "Digite sua senha.";
            errorMsg.classList.remove('hidden');
            return;
        }

        if(currentUser.password !== pwdInput) {
            errorMsg.textContent = "Senha incorreta.";
            errorMsg.classList.remove('hidden');
            return;
        }

        await commitProfileUpdate();
    };

    const commitProfileUpdate = async () => {
        if (!pendingProfileUpdates) return;
    
        // Envia para o Supabase
        const success = await updateUserProfileInDB(pendingProfileUpdates);
    
        if (success) {
            // === IMPORTANTE ===
            // Recarrega os dados do banco imediatamente para atualizar a Navbar e variáveis locais
            await loadUserProfile(); 
            
            // Fecha os modais e mostra sucesso
            document.getElementById('password-challenge-modal').classList.add('hidden');
            document.getElementById('unified-profile-modal').classList.add('hidden');
            document.getElementById('success-modal').classList.remove('hidden');
            
            // Limpa campos de senha
            document.getElementById('edit-new-password').value = '';
        } else {
            showNotification("Erro ao atualizar perfil no banco de dados.", 'error');
        }
        pendingProfileUpdates = null;
    };
    document.getElementById('close-all-modals-btn').onclick = () => {
        document.getElementById('success-modal').classList.add('hidden');
    };
    
    document.querySelectorAll('.close-challenge-btn').forEach(btn => {
        btn.onclick = () => {
            document.getElementById('password-challenge-modal').classList.add('hidden');
            pendingProfileUpdates = null;
        };
    });

    // --- EXPORTAR ---
    const btnExport = document.getElementById('export-btn');
    if(btnExport) {
        btnExport.onclick = async () => {
            let allEntries = await fetchEntries();
            const filter = getActiveFilter();
            const today = new Date(); today.setHours(0,0,0,0);
            let entries = allEntries;
            if (filter === 'today') entries = entries.filter(e => new Date(e.timestamp) >= today);
            
            if (entries.length === 0) return showNotification('Sem dados para exportar.', 'warning');
            
            let data = (currentViewMode === 'summary') 
                ? (() => {
                    const grouped = {};
                    entries.forEach(e => {
                        const dateStr = new Date(e.timestamp).toLocaleDateString();
                        const key = `${dateStr}:::${e.activity}`;
                        if(!grouped[key]) grouped[key] = { date: dateStr, activity: e.activity, seconds: 0 };
                        grouped[key].seconds += e.seconds;
                    });
                    return Object.values(grouped).map(e => ({ 'Data': e.date, 'Atividade': e.activity, 'Tempo': formatTime(e.seconds) }));
                })()
                : entries.map(e => ({ 'Data': new Date(e.timestamp).toLocaleDateString(), 'Hora': new Date(e.timestamp).toLocaleTimeString(), 'Atividade': e.activity, 'Duração': formatTime(e.seconds) }));
            
            if(typeof XLSX !== 'undefined') {
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Relatório DHL");
                XLSX.writeFile(wb, "Relatorio_Horas.xlsx");
                
                await markAsExportedInDB(entries);
                renderHistory(); 
                showNotification('Download iniciado e registros marcados como Concluídos.', 'success');
            } else {
                showNotification('Biblioteca XLSX não carregada.', 'error');
            }
        };
    }

    // --- LOGOUT ---
    document.getElementById('logout-btn').onclick = (e) => {
        e.preventDefault();
        
        // Limpa sessão
        localStorage.removeItem('usuarioLogado');
        localStorage.removeItem('dhl_active_user');
    
        // Limpa o Timer para não vazar para outro usuário
        localStorage.removeItem('dhl_timer_start');
        localStorage.removeItem('dhl_timer_activity');
    
        window.location.href = 'index.html';
    };
    // --- Eventos Globais ---
    document.querySelectorAll('#history-filters .filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#history-filters .filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            isHistoryExpanded = false;
            renderHistory();
        };
    });

    document.querySelectorAll('#view-mode-buttons .filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#view-mode-buttons .filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentViewMode = e.currentTarget.dataset.view;
            isHistoryExpanded = false;
            renderHistory();
        };
    });

    document.getElementById('user-menu-btn').onclick = () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    };

    const dmBtn = document.getElementById('dark-mode-toggle');
    if(localStorage.getItem('dhl_dark_mode')==='true') document.body.classList.add('dark-mode');
    if(dmBtn) {
        dmBtn.onclick = () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('dhl_dark_mode', document.body.classList.contains('dark-mode'));
        };
    }
    
    document.querySelectorAll('.close-modal, .close-modal-btn').forEach(b => {
        b.onclick = function() { toggleModal(this.closest('.modal'), false); };
    });

    // --- INICIALIZAÇÃO ---
    setupSelects();
    await loadUserProfile(); 
    checkActiveTimer();
    renderHistory();
});
