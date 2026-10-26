(() => {
 const form=document.getElementById('feedback-form');
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const get=id=>document.getElementById(id).value.trim();
  const body=[get('feedback-message'),'',[get('feedback-name'),get('feedback-email')].filter(Boolean).join(' · ')].join('\n');
  location.href='mailto:contact.manacitra@gmail.com?subject='+encodeURIComponent(get('feedback-subject'))+'&body='+encodeURIComponent(body);
  document.getElementById('feedback-status').textContent='If no email app opens, use the email address above. Your message has not been sent automatically.';
 });
})();
