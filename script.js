// ====================================
// CONFIGURACIÓN (Variables tomadas de menu_data.json)
// ====================================
let MENU_DATA = null;
let ALL_ITEMS_MAP = {}; 
let cart = {}; 
let currentMesa = null; 
let deliveryFee = 0;
let deliveryCalculated = false; // Flag para evitar recalcular
let userLocation = null;

// >>> CONFIGURACIÓN PARA EL REGISTRO DE PEDIDOS EN GOOGLE SHEETS <<<
const LOG_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzpqx39mQ4VND0pvAp2udcJbugOI995I80QI18eME0tJ-BMlUOq2xqEuAT_6n2Gijnn/exec'; 
// =================================================================

// --- Funciones de Utilidad ---

// --- LÓGICA DE BÚSQUEDA (Idea #1) ---
function filterMenu() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const categories = document.querySelectorAll('.menu-category');

    categories.forEach(category => {
        const categoryName = category.querySelector('h2').textContent.toLowerCase();
        const items = category.querySelectorAll('.menu-item, .menu-item-complex');
        let categoryMatches = categoryName.includes(searchTerm);
        let itemFound = false;

        items.forEach(item => {
            // Asegura que busca el título del ítem, independientemente de si es simple o complejo
            const itemTitleEl = item.querySelector('.item-title') || item.querySelector('.item-info');
            const itemName = itemTitleEl ? itemTitleEl.textContent.toLowerCase() : '';

            if (itemName.includes(searchTerm) || searchTerm === '') {
                item.classList.remove('hidden');
                itemFound = true;
            } else {
                item.classList.add('hidden');
            }
        });

        // Oculta la categoría si no coincide el nombre y ningún ítem es visible
        if (searchTerm !== '' && !categoryMatches && !itemFound) {
            category.classList.add('hidden');
        } else {
            category.classList.remove('hidden');
        }
    });
}
// ------------------------------------

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (value) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance;
}

function getDeliveryCost(distanceKm) {
    const ratePerKm = 1.00;
    const minCost = 1.00;
    return Math.max(minCost, distanceKm * ratePerKm); 
}


// --- LÓGICA DE CARRO: Dos modos de añadir ---

// 1. MODO SIMPLE (+/-): Para ítems sin personalización (Pan Salchicha, etc.)
function updateCart(itemId, change) {
    const itemData = ALL_ITEMS_MAP[itemId];
    if (!itemData || itemData.options) return;

    let currentQuantity = cart[itemId] ? cart[itemId].quantity : 0;
    let newQuantity = currentQuantity + change;

    if (newQuantity < 0) return;

    if (newQuantity === 0) {
        delete cart[itemId];
    } else {
        cart[itemId] = {
            id: itemId, 
            name: itemData.name,
            price: itemData.price,
            basePrice: itemData.price,
            quantity: newQuantity,
            isSimple: true 
        };
    }

    updateCartDisplay();
}

// 2. MODO COMPLEJO (Añadir al Pedido): Para ítems con personalización (Whopper, etc.)
function addItemWithDetails(id, name, price, itemElement) {
    let details = [];
    
    const checkboxes = itemElement.querySelectorAll('.opciones-grupo input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            details.push(cb.value);
        }
    });

    const notesBox = itemElement.querySelector('.instrucciones-box');
    const notes = notesBox ? notesBox.value.trim() : '';
    
    if (notes) {
        details.push(`Nota: ${notes}`);
    }

    const itemDetails = details.length > 0 ? ` (${details.join(', ')})` : '';
    const uniqueId = `${id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const itemName = name + itemDetails;

    cart[uniqueId] = { 
        id: uniqueId,
        name: itemName, 
        price: price, 
        basePrice: price,
        quantity: 1,
        isSimple: false, 
        baseId: id 
    };
    
    if (notesBox) {
        notesBox.value = '';
    }
    checkboxes.forEach(cb => {
        if (cb.getAttribute('data-default-checked') === 'true') {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });

    updateCartDisplay();
}

// 3. FUNCIÓN DE ELIMINACIÓN ÚNICA (desde el carrito detallado)
function removeItemFromCart(uniqueId) {
    if (cart[uniqueId]) {
        // Si el ítem es simple, eliminamos toda la cantidad, lo que en la práctica es igual a eliminarlo.
        delete cart[uniqueId];
    }
    updateCartDisplay();
}


// --- LÓGICA DE CÁLCULO INMEDIATO DE DELIVERY (Idea #3) ---

function calculateDeliveryFee(callback) {
    if (!MENU_DATA) {
        if (callback) callback(0, 0, 0, 0);
        return;
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    const loadingMessage = document.getElementById('loading-location');
    loadingMessage.style.display = 'block';
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Calculando envío...';
    
    // Si ya fue calculado, simplemente actualizamos la vista
    if (deliveryCalculated) {
        const subtotal = calculateSubtotal();
        const finalTotal = subtotal + deliveryFee;
        loadingMessage.style.display = 'none';
        checkoutBtn.disabled = false;
        if (callback) callback(deliveryFee, 0, 0, 0); // No necesitamos pasar lat/lon/dist en este caso
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const clientLat = position.coords.latitude;
                const clientLon = position.coords.longitude;
                
                const ORIGIN_LAT = MENU_DATA.info.origin_lat;
                const ORIGIN_LON = MENU_DATA.info.origin_lon;
                
                const distanceKm = calculateDistance(ORIGIN_LAT, ORIGIN_LON, clientLat, clientLon);
                
                deliveryFee = getDeliveryCost(distanceKm); 
                deliveryCalculated = true; // Establecer flag

                loadingMessage.style.display = 'none';
                checkoutBtn.disabled = false;
                
                if (callback) callback(deliveryFee, distanceKm, clientLat, clientLon);
                updateCartDisplay(); // Forzar actualización del total
            },
            (error) => {
                console.error('Error de geolocalización:', error);
                
                // Fallo: usar 0 costo, pero no marcar como calculado para intentarlo de nuevo si el usuario cambia de idea.
                deliveryFee = 0;
                deliveryCalculated = false; 

                loadingMessage.style.display = 'none';
                checkoutBtn.disabled = false;
                
                if (callback) callback(0, 0, 0, 0); 
                updateCartDisplay(); // Forzar actualización del total con el error
            }
        );
    } else {
        console.error('Geolocalización no soportada.');
        
        deliveryFee = 0;
        deliveryCalculated = false;

        loadingMessage.style.display = 'none';
        checkoutBtn.disabled = false;
        
        if (callback) callback(0, 0, 0, 0); 
        updateCartDisplay(); // Forzar actualización del total con el error
    }
}

function handleDeliveryToggle() {
    const isDelivery = document.getElementById('delivery-checkbox').checked;
    const loadingMessage = document.getElementById('loading-location');
    
    if (isDelivery) {
        // Al marcar, intentar calcular
        calculateDeliveryFee(() => {});
    } else {
        // Al desmarcar, resetear valores
        deliveryFee = 0;
        deliveryCalculated = false;
        loadingMessage.style.display = 'none';
        updateCartDisplay(); 
    }
}

// ------------------------------------

// Utility function to calculate subtotal
function calculateSubtotal() {
    let subtotal = 0;
    for (const uniqueId in cart) {
        subtotal += cart[uniqueId].price * cart[uniqueId].quantity;
    }
    return subtotal;
}

// --- Función principal para cargar el menú y Renderizar ---
async function loadMenuData() {
    try {
        const response = await fetch('menu_data.json');
        if (!response.ok) {
            throw new Error('No se pudo cargar menu_data.json');
        }
        const data = await response.json();
        MENU_DATA = data;
        
        // >> LÓGICA DE DETECCIÓN DE MESA <<
        const mesaParam = getUrlParameter('mesa');
        const orderOptionsEl = document.querySelector('.order-options');
        const mesaInfoEl = document.getElementById('mesa-info');
        
        if (mesaParam && !isNaN(parseInt(mesaParam))) {
            currentMesa = parseInt(mesaParam);
            
            if (mesaInfoEl) { 
                mesaInfoEl.style.display = 'block';
                mesaInfoEl.textContent = `¡Estás pidiendo desde la MESA N° ${currentMesa}! Tu pedido es para comer en local.`;
            }
            
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'none';
            }
            
        } else {
            currentMesa = null;
            if (orderOptionsEl) { 
                orderOptionsEl.style.display = 'flex'; 
            }
        }
        
        // 1. Inicializar el mapa de ítems y poblar la información del header
        document.getElementById('promo-container').textContent = data.info.promo;
        document.getElementById('schedule-container').innerHTML = `🕔 **HORARIO DE ATENCIÓN:** ${data.info.schedule}`;
        
        let menuHtml = '';
        data.categories.forEach(category => {
            menuHtml += `
                <section class="menu-category">
                    <h2>${category.name}</h2>
                    <p class="slogan">${category.slogan}</p>
                    <div class="menu-item-list">
            `;

            category.items.forEach(item => {
                ALL_ITEMS_MAP[item.id] = item;
                
                const topVentaTag = item.top_venta ? '<span class="top-venta-tag">⭐ TOP VENTA</span>' : '';
                
                const isComplex = item.options && item.options.length > 0;
                
                if (isComplex) {
                    // --- GENERACIÓN DE ITEM COMPLEJO (Botón Añadir + Opciones) ---
                    let optionsHTML = '';
                    let placeholderText = 'Instrucciones Especiales: (Ej: Poco queso, sin lechuga)';

                    optionsHTML += '<h3 class="opciones-titulo">Personaliza tu ' + item.name + ':</h3>';
                    optionsHTML += '<div class="opciones-grupo">';
                    item.options.forEach(option => {
                        const isChecked = option.checked ? 'checked' : '';
                        const defaultAttr = option.checked ? 'data-default-checked="true"' : '';
                        optionsHTML += `
                            <label>
                                <input type="checkbox" value="${option.value}" ${isChecked} ${defaultAttr}> 
                                ${option.label}
                            </label>`;
                    });
                    optionsHTML += '</div>';
                    placeholderText = 'Instrucciones: (Ej: Sin pepinillos, extra queso)';

                    menuHtml += `
                        <div class="menu-item-complex" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                            <div class="item-header">
                                <span class="item-title">${item.name} ${topVentaTag}</span>
                                <span class="price">${item.price.toFixed(2)}$</span>
                            </div>
                            ${optionsHTML}
                            <textarea placeholder="${placeholderText}" rows="2" class="instrucciones-box"></textarea>
                            <button class="add-to-cart-btn full-width" onclick="addItemWithDetails('${item.id}', '${item.name}', ${item.price}, this.parentNode)">
                                Añadir ${item.name} al Pedido
                            </button>
                        </div>
                    `;

                } else {
                    // --- GENERACIÓN DE ITEM SIMPLE (Botones +/-) ---
                    menuHtml += `
                        <div class="menu-item" data-id="${item.id}">
                            <span class="item-info">${item.name} ${topVentaTag}</span>
                            <div class="item-controls">
                                <span class="price">${item.price.toFixed(2)}$</span>
                                <div class="quantity-control">
                                    <button class="quantity-btn" onclick="updateCart('${item.id}', -1)">-</button>
                                    <span class="item-quantity">0</span>
                                    <button class="quantity-btn" onclick="updateCart('${item.id}', 1)">+</button>
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            menuHtml += `
                    </div>
                </section>
            `;
        });

        document.getElementById('menu-content-container').innerHTML = menuHtml;
        
        // Add search listener
        document.getElementById('search-input').addEventListener('input', filterMenu);
        
        updateCartDisplay();
        setInterval(updateCartDisplay, 1000);

    } catch (error) {
        console.error("Error al cargar o renderizar el menú:", error);
        document.getElementById('menu-content-container').innerHTML = `<p style="color:red; text-align:center;">❌ ERROR: No se pudo cargar el menú. Verifica que el archivo **menu_data.json** exista y esté correcto.</p>`;
    }
}


// --- FUNCIONES DE DISPLAY Y CARRITO ---

function renderCartItems() {
    const cartContainer = document.getElementById('cart-items-container');
    let cartHtml = '';
    let totalItemsInCart = Object.keys(cart).length;

    if (totalItemsInCart === 0) {
        cartContainer.innerHTML = '<p class="empty-cart-message">Tu pedido está vacío. ¡Comienza a añadir!</p>';
        cartContainer.style.display = 'none';
        return;
    }
    
    cartContainer.style.display = 'block';
    cartHtml += '<h3 class="cart-title">📝 Detalle de tu Pedido:</h3>';

    for (const uniqueId in cart) {
        const item = cart[uniqueId];
        const itemQty = item.isSimple ? item.quantity : 1; 

        cartHtml += `
            <div class="cart-item-detail">
                <span class="cart-item-qty">${itemQty}x</span>
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-price">${(item.price * itemQty).toFixed(2)}$}</span>
                <button class="remove-item-btn" 
                        onclick="removeItemFromCart('${uniqueId}')">
                    ❌
                </button>
            </div>
        `;
    }
    
    cartContainer.innerHTML = cartHtml;
}

function updateCartDisplay() {
    if (!MENU_DATA) return;

    let subtotal = calculateSubtotal();
    let totalItems = 0;
    
    for (const uniqueId in cart) {
        totalItems += cart[uniqueId].quantity;
    }
    
    renderCartItems(); 

    document.querySelectorAll('.menu-item').forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-id');
        const quantityElement = itemEl.querySelector('.item-quantity');
        quantityElement.textContent = cart[itemId] && cart[itemId].isSimple ? cart[itemId].quantity : 0;
    });
    
    // Actualiza el badge del contador de ítems
    document.getElementById('cart-item-count').textContent = totalItems;
    document.getElementById('cart-item-count').style.display = totalItems > 0 ? 'inline-block' : 'none';


    const isDelivery = currentMesa ? false : document.getElementById('delivery-checkbox').checked; 
    
    const deliveryDetails = document.getElementById('delivery-details');
    const checkoutBtn = document.getElementById('checkout-btn');

    // Deshabilitación por Límite de tiempo (Barra de Cooldown)
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    
    const cooldownBar = document.getElementById('cooldown-bar');
    const cooldownFill = document.getElementById('cooldown-fill');
    const cooldownText = document.getElementById('cooldown-text');
    
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        checkoutBtn.disabled = true;
        cooldownBar.style.display = 'flex'; // Mostrar la barra
        checkoutBtn.style.visibility = 'hidden'; // Ocultar el botón base
        
        const elapsedSeconds = (now - lastOrderTime) / 1000;
        const remainingSeconds = Math.ceil(COOLDOWN_SECS - elapsedSeconds);
        const progressPercent = (elapsedSeconds / COOLDOWN_SECS) * 100;

        cooldownFill.style.width = `${progressPercent}%`;
        cooldownText.textContent = `ESPERA: ${remainingSeconds}s para nuevo pedido`;
        
    } else {
        cooldownBar.style.display = 'none'; // Ocultar la barra
        checkoutBtn.style.visibility = 'visible'; // Mostrar el botón base
        checkoutBtn.disabled = totalItems === 0;
    }


    let currentTotal = subtotal;
    
    document.getElementById('cart-total-price').textContent = subtotal.toFixed(2);
    
    if (currentMesa) {
        deliveryDetails.textContent = "";
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido MESA ${currentMesa} - Total: ${currentTotal.toFixed(2)}$`;
        }
    } else if (isDelivery) {
        
        if (deliveryCalculated) {
            currentTotal += deliveryFee;
            deliveryDetails.textContent = `✅ Costo de Delivery calculado: ${deliveryFee.toFixed(2)}$`;
            document.getElementById('cart-total-price').textContent = currentTotal.toFixed(2);
            
            if (totalItems > 0 && !checkoutBtn.disabled) {
                 checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - TOTAL: ${currentTotal.toFixed(2)}$`;
            }
            
        } else {
             deliveryDetails.textContent = "⏳ Calculando costo de Delivery... Por favor, acepte el permiso de ubicación.";
             
             if (totalItems > 0 && !checkoutBtn.disabled) {
                 checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Subtotal: ${subtotal.toFixed(2)}$`;
             }
        }
    } else {
        deliveryDetails.textContent = "Retiro en Tienda seleccionado.";
        
        if (totalItems > 0 && !checkoutBtn.disabled) {
            checkoutBtn.textContent = `Hacer Pedido (${totalItems} ítems) - Total: ${subtotal.toFixed(2)}$`;
        }
    }

    if (totalItems === 0) {
        document.getElementById('cart-total-price').textContent = "0.00";
    }
}


// --- Lógica de Envío (Incluye GPS y Mesa) ---

function sendOrder(subtotal, finalTotal, distanceKm, lat, lon) {
    
    const isDelivery = !currentMesa && document.getElementById('delivery-checkbox').checked;
    let message = "🛒 *NUEVO PEDIDO PA QUE WAINER* 🍔\n\n";
    
    let index = 1;
    for (const uniqueId in cart) {
        const item = cart[uniqueId];
        const itemQty = item.isSimple ? item.quantity : 1;
        const itemName = item.name;
        const itemPrice = item.price * itemQty;

        message += `${index}. *${itemQty}x* ${itemName} = ${itemPrice.toFixed(2)}$\n`; 
        index++;
    }

    message += "\n----------------------------------\n";
    
    // Corrected Google Maps URL using a standard format that works with coordinates
    // Nota: El formato real para Google Maps es https://maps.google.com/maps?q=lat,lon
    const mapsUrl = distanceKm > 0 ? `https://maps.google.com/maps?q=${lat},${lon}` : "N/A";
    
    if (currentMesa) {
        message += `📍 *ORDEN DE MESA N°: ${currentMesa}*\n`;
        message += `✅ *SERVICIO:* COMER EN LOCAL 🍽️\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
        
    } else if (isDelivery) {
        
        if (distanceKm > 0) {
            const deliveryCost = finalTotal - subtotal;
            
            message += `✅ *SERVICIO:* DELIVERY 🚚\n`;
            message += `📍 *DISTANCIA CALCULADA:* ${distanceKm.toFixed(2)} km\n`;
            message += `💵 *COSTO DELIVERY:* ${deliveryCost.toFixed(2)}$ (1$/km, mínimo 1$)\n`;
            message += `\n*SUBTOTAL (Comida):* ${subtotal.toFixed(2)}$\n`;
            message += `*TOTAL FINAL:* ${finalTotal.toFixed(2)}$\n`;
            message += `🗺️ *UBICACIÓN CLIENTE:* ${mapsUrl}\n`;
            
        } else {
            message += `❌ *SERVICIO:* DELIVERY (FALLIDO) 🚚\n`;
            message += `⚠️ *ATENCIÓN:* No se pudo obtener la ubicación o fue rechazada. El costo de delivery se calculará a la entrega.\n`;
            message += `\n*TOTAL A PAGAR (Comida):* ${subtotal.toFixed(2)}$\n`;
        }
    } else {
        message += `✅ *SERVICIO:* RETIRO EN TIENDA 🚶\n`;
        message += `💰 *TOTAL A PAGAR:* ${subtotal.toFixed(2)}$\n`;
    }
    
    message += "----------------------------------\n";
    message += "\nPor favor, indique su nombre.";
    
    
    // ----------------------------------------------------
    // >> LÓGICA DE REGISTRO EN GOOGLE SHEETS/API <<
    // ----------------------------------------------------
    const serviceType = currentMesa ? `Mesa N° ${currentMesa}` : (isDelivery ? 'Delivery' : 'Retiro en Tienda');
    const mapsUrlForLog = distanceKm > 0 ? `https://maps.google.com/maps?q=${lat},${lon}` : "N/A";

    const logData = {
        fecha: new Date().toLocaleDateString('es-VE'),
        hora: new Date().toLocaleTimeString('es-VE'),
        total: finalTotal.toFixed(2),
        servicio: serviceType,
        distancia: distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : "N/A",
        // Concatenar los detalles de los ítems en un formato legible
        detalle_pedido: Object.values(cart).map(item => `${item.quantity}x ${item.name}`).join('; '),
        ubicacion_url: mapsUrlForLog
    };

    // Envía los datos de forma asíncrona a tu endpoint (Google Apps Script)
    fetch(LOG_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData)
    })
    .then(response => {
        // La consola indicará que se intentó enviar, incluso con 'no-cors'
        console.log("Datos de pedido enviados para registro.");
    })
    .catch(error => console.error('Error al intentar registrar el pedido:', error));
    
    // ----------------------------------------------------
    // >> FIN LÓGICA DE REGISTRO <<
    // ----------------------------------------------------


    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${MENU_DATA.info.whatsapp_number}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
    
    localStorage.setItem('lastOrderTime', Date.now());

    cart = {};
    updateCartDisplay();
}

function checkAndSendOrder() {
    
    if (!MENU_DATA) {
         alert("Error: El menú no se ha cargado correctamente.");
         return;
    }

    // 1. VERIFICACIÓN DEL LÍMITE DE TIEMPO
    const lastOrderTime = localStorage.getItem('lastOrderTime');
    const now = Date.now();
    const COOLDOWN_SECS = MENU_DATA.info.cooldown_seconds;
    if (lastOrderTime && (now - lastOrderTime) < (COOLDOWN_SECS * 1000)) {
        return;
    }
    
    let subtotal = calculateSubtotal();

    if (Object.keys(cart).length === 0) {
        alert("Por favor, agregue al menos un artículo al carrito antes de hacer el pedido.");
        return;
    }

    // Si es una mesa, saltamos la verificación de Delivery y Geolocalización.
    if (currentMesa) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si NO es una mesa, revisamos si es Delivery o Retiro.
    const isDelivery = document.getElementById('delivery-checkbox').checked;

    if (!isDelivery) {
        sendOrder(subtotal, subtotal, 0, 0, 0); 
        return;
    }
    
    // Si es Delivery, usamos el cálculo previamente hecho o lo hacemos ahora.
    if (deliveryCalculated) {
        
        const checkoutBtn = document.getElementById('checkout-btn');
        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Procesando pedido...';
        
        // Recalculamos la ubicación final para tener lat/lon/dist exactos para el WhatsApp y el registro
        calculateDeliveryFee((fee, distanceKm, clientLat, clientLon) => {
             const final = subtotal + fee;
             sendOrder(subtotal, final, distanceKm, clientLat, clientLon);
             // El botón se rehabilita al final de sendOrder
        });

    } else {
        // Si no se pudo calcular (por error de GPS), enviamos con costo 0 y advertencia.
        alert("No se pudo calcular el costo de envío (permiso de GPS denegado o no soportado). El costo se calculará a la entrega.");
        sendOrder(subtotal, subtotal, 0, 0, 0); // Envío pendiente (costo 0)
    }
}

document.addEventListener('DOMContentLoaded', loadMenuData);
